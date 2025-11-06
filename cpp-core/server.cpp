
#include "common.hpp"

#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")

#include <fcntl.h>
#include <io.h>
#include <sys/stat.h>
#include <direct.h>
#include <filesystem>
#include <list>
#include <mutex>
#include <thread>
#include <unordered_map>
#include <vector>
#include <string>
#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <windows.h>

namespace fs = std::filesystem;

// ------------------- CONFIG -------------------
static std::string DATA_DIR = "data";
static const char* DEFAULT_FN = "store.bin";

// ----------- timestamped thread-safe logger with color + trace ID -----------
static std::mutex g_log_mtx;

enum class LogLevel { INFO, WARN, ERR };

static std::string now_str() {
    using namespace std::chrono;
    auto t = system_clock::now();
    std::time_t tt = system_clock::to_time_t(t);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &tt);
#else
    localtime_r(&tt, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%H:%M:%S");
    return oss.str();
}

static const char* color(LogLevel lvl) {
    switch (lvl) {
        case LogLevel::INFO: return "\x1b[32m";  // green
        case LogLevel::WARN: return "\x1b[33m";  // yellow
        case LogLevel::ERR:  return "\x1b[31m";  // red
        default: return "\x1b[0m";
    }
}

static void log_msg(LogLevel lvl, const std::string& msg, const std::string& trace = "") {
    std::lock_guard<std::mutex> lk(g_log_mtx);
    std::ostringstream prefix;
    prefix << "[" << now_str() << "] [T" << std::this_thread::get_id() << "]";
    if (!trace.empty()) prefix << " [" << trace << "]";
    std::cout << color(lvl) << prefix.str() << " " << msg << "\x1b[0m" << std::endl;
}

#define LOGI(msg) log_msg(LogLevel::INFO, msg)
#define LOGW(msg) log_msg(LogLevel::WARN, msg)
#define LOGE(msg) log_msg(LogLevel::ERR, msg)

// -------------- NFS directory detection --------------
static void set_data_dir_from_env() {
    SetConsoleOutputCP(CP_UTF8);
    std::ios_base::sync_with_stdio(false);
    std::cout.tie(nullptr);

    const char* env = std::getenv("NFS_PATH");
    if (env && *env) DATA_DIR = env;

    if (!fs::exists(DATA_DIR)) {
        std::error_code ec;
        fs::create_directories(DATA_DIR, ec);
        if (ec) LOGW("Could not create data dir: " + ec.message());
    }
    LOGI("📁 Data directory set to: " + DATA_DIR);
}

// ---------------- LRU cache ----------------
struct Key {
    long long off = 0, len = 0;
    bool operator==(const Key& o) const { return off == o.off && len == o.len; }
};
struct KeyHash {
    size_t operator()(const Key& k) const {
        return std::hash<long long>()(k.off ^ (k.len * 11400714819323198485ull));
    }
};

class LRU {
    using Node = std::pair<Key, std::vector<char>>;
    using It   = std::list<Node>::iterator;
    std::list<Node> order_;
    std::unordered_map<Key, It, KeyHash> map_;
    size_t cap_;
    std::mutex mtx_;
public:
    explicit LRU(size_t cap) : cap_(cap) {}

    bool get(const Key& k, std::vector<char>& out) {
        std::lock_guard<std::mutex> lk(mtx_);
        auto it = map_.find(k);
        if (it == map_.end()) {
            // 🔥 DEBUG LOG
            LOGW("LRU MISS: off=" + std::to_string(k.off) + " len=" + std::to_string(k.len));
            return false;
        }

        order_.splice(order_.begin(), order_, it->second);
        out = it->second->second;

        // 🔥 DEBUG LOG
        LOGI("LRU HIT: off=" + std::to_string(k.off) + " len=" + std::to_string(k.len));

        return true;
    }

    void put(const Key& k, std::vector<char>&& val) {
        std::lock_guard<std::mutex> lk(mtx_);
        auto it = map_.find(k);
        if (it != map_.end()) {
            it->second->second = std::move(val);
            order_.splice(order_.begin(), order_, it->second);

            // 🔥 DEBUG LOG
            LOGI("LRU UPDATE (existing): off=" + std::to_string(k.off) + " len=" + std::to_string(k.len));
            return;
        }

        order_.emplace_front(k, std::move(val));
        map_[k] = order_.begin();

        // 🔥 DEBUG LOG
        LOGI("LRU INSERT: off=" + std::to_string(k.off) + " len=" + std::to_string(k.len));

        if (map_.size() > cap_) {
            auto& back = order_.back();
            Key victim = back.first;

            // 🔥 DEBUG LOG
            LOGW("LRU EVICT: off=" + std::to_string(victim.off) + " len=" + std::to_string(victim.len));

            map_.erase(victim);
            order_.pop_back();
        }
    }

    void clear() {
        std::lock_guard<std::mutex> lk(mtx_);
        LOGW("LRU CLEAR for this file"); // 🔥 DEBUG
        order_.clear();
        map_.clear();
    }
};


static std::mutex g_caches_mtx;
static std::unordered_map<std::string, LRU*> g_fileCaches;

static LRU* cache_for(const std::string& name) {
    std::lock_guard<std::mutex> lk(g_caches_mtx);
    auto it = g_fileCaches.find(name);
    if (it != g_fileCaches.end()) return it->second;
    LRU* l = new LRU(128);
    g_fileCaches[name] = l;
    return l;
}

// ---------------- socket helpers ----------------
static bool send_all(SOCKET s, const char* buf, int len) {
    int sent = 0;
    while (sent < len) {
        int n = send(s, buf + sent, len - sent, 0);
        if (n <= 0) {
            LOGE("⚠️ send() failed or closed");
            return false;
        }
        LOGI("⬆️ Sent chunk of " + std::to_string(n) + " bytes");
        sent += n;
    }
    LOGI("✅ Total sent: " + std::to_string(sent) + " bytes");
    return true;
}


static bool recv_n(SOCKET s, char* buf, int len) {
    int got = 0;
    while (got < len) {
        int n = recv(s, buf + got, len - got, 0);
        if (n <= 0) {
            LOGE("⚠️ recv() failed or closed");
            return false;
        }
        LOGI("⬇️ Received chunk of " + std::to_string(n) + " bytes");
        got += n;
    }
    LOGI("✅ Total received: " + std::to_string(got) + " bytes");
    return true;
}

static bool recv_line(SOCKET s, std::string& out) {
    out.clear();
    char c;
    int total = 0;
    while (true) {
        int n = recv(s, &c, 1, 0);
        if (n == 0) {
            // ✅ client closed socket gracefully
            LOGI("⬇️ Client closed connection (EOF)");
            return false;
        }
        if (n < 0) {
            LOGE("❌ recv_line() error");
            return false;
        }

        total += n;
        if (c == '\n') break;
        if (c != '\r') out.push_back(c);
        if (out.size() > 4096) return false;
    }

    LOGI("⬇️ Received line (" + std::to_string(total) + " bytes): " + out);
    return true;
}



// ---------------- file helpers ----------------
static void ensure_data_dir() {
    if (!fs::exists(DATA_DIR)) _mkdir(DATA_DIR.c_str());
}

static std::string path_for(const std::string& name) {
    return DATA_DIR + "/" + name;
}

static int open_rw_create(const std::string& path) {
    int fd = _open(path.c_str(), _O_RDWR | _O_BINARY);
    if (fd < 0)
        fd = _open(path.c_str(), _O_CREAT | _O_RDWR | _O_BINARY, _S_IREAD | _S_IWRITE);
    return fd;
}

static long long file_size_bytes(const std::string& name) {
    auto p = path_for(name);
    std::error_code ec;
    auto sz = fs::file_size(p, ec);
    if (ec) return -1;
    return (long long)sz;
}

static std::string list_files_payload() {
    std::string out;
    for (auto& p : fs::directory_iterator(DATA_DIR)) {
        if (!p.is_regular_file()) continue;
        const std::string fname = p.path().filename().string();

        // hide internal or default files
        if (fname == DEFAULT_FN) continue;         // store.bin
        if (fname == "default.tmp") continue;      // temp file
        if (!fname.empty() && fname[0] == '.') continue; // dotfiles & .trash

        out += fname;
        out += "\n";
    }
    return out;
}



// ---------------- read / write ----------------
static std::mutex g_write_mtx;

static bool do_read(int fd, const std::string& fname, long long off, long long len, std::vector<char>& out, const std::string& trace="") {
    log_msg(LogLevel::INFO, "do_read(" + fname + ", off=" + std::to_string(off) + ", len=" + std::to_string(len) + ")", trace);
    if (off < 0 || len < 0) return false;
    Key k{off, len};
    LRU* lru = cache_for(fname);
    if (lru->get(k, out)) {
        log_msg(LogLevel::INFO, "Cache HIT " + fname, trace);
        return true;
    }
    auto start = std::chrono::high_resolution_clock::now();
    out.assign((size_t)len, 0);
    _lseek(fd, (long)off, SEEK_SET);
    int n = _read(fd, out.data(), (unsigned)len);
    if (n < 0) return false;
    out.resize((size_t)n);
    lru->put(k, std::vector<char>(out.begin(), out.end()));
    auto end = std::chrono::high_resolution_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    log_msg(LogLevel::INFO, "Cache MISS — read " + std::to_string(n) + " bytes in " + std::to_string(ms) + " ms", trace);
    return true;
}

static bool do_write(int fd, const std::string& fname, long long off, const char* data, long long len, const std::string& trace="") {
    log_msg(LogLevel::INFO, "do_write(" + fname + ", off=" + std::to_string(off) + ", len=" + std::to_string(len) + ")", trace);
    if (off < 0 || len < 0) return false;

    { std::lock_guard<std::mutex> lk(g_caches_mtx);
      auto it = g_fileCaches.find(fname);
      if (it != g_fileCaches.end() && it->second) it->second->clear(); }

    std::lock_guard<std::mutex> lk2(g_write_mtx);
    auto start = std::chrono::high_resolution_clock::now();
    _lseek(fd, (long)off, SEEK_SET);
    int n = _write(fd, data, (unsigned)len);
    auto end = std::chrono::high_resolution_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    log_msg(LogLevel::INFO, "✅ File write complete: " + std::to_string(n) + " bytes (" + std::to_string(ms) + " ms)", trace);
    return n == len;
}

static std::string list_trash_payload() {
    std::string trashDir = DATA_DIR + "/.trash";
    std::string out;

    if (!fs::exists(trashDir)) return out;

    for (auto& p : fs::directory_iterator(trashDir)) {
        if (!p.is_regular_file()) continue;
        const std::string fname = p.path().filename().string();
        out += fname + "\n";
    }
    return out;
}

// ---------------- delete ----------------
static bool delete_file_and_cache(const std::string& name, const std::string& trace="") {
    auto p = path_for(name);
    log_msg(LogLevel::WARN, "Deleting file " + name + " -> " + p, trace);

    // Ensure .trash directory exists
    std::string trashDir = DATA_DIR + "/.trash";
    if (!fs::exists(trashDir)) {
        std::error_code ec;
        fs::create_directories(trashDir, ec);
    }

    // Move file instead of deleting
    std::string dest = trashDir + "/" + name;
    std::error_code ec;
    fs::rename(p, dest, ec);

    if (ec) {
        log_msg(LogLevel::ERR, "Failed to move to trash: " + ec.message(), trace);
        return false;
    }

    // Clear cache
    {
        std::lock_guard<std::mutex> lk(g_caches_mtx);
        auto it = g_fileCaches.find(name);
        if (it != g_fileCaches.end() && it->second) {
            it->second->clear();
            delete it->second;
            g_fileCaches.erase(it);
        }
    }

    log_msg(LogLevel::INFO, "✅ Moved to trash: " + dest, trace);
    return true;
}


// ---------------- per-client handler ----------------
static void handle_client(SOCKET cs) {
    ensure_data_dir();
    LOGI("🔌 New client connected");

    std::string trace_id;
    std::string pending;   // ← hold the first line if it’s not TRACE

    // Read one line to see if it’s TRACE. If not, keep it for the loop.
    {
        std::string first;
        if (recv_line(cs, first)) {
            if (first.rfind("TRACE ", 0) == 0) {
                trace_id = first.substr(6);
                LOGI("🪪 Trace ID: " + trace_id);
            } else {
                pending = std::move(first); // ← preserve the real first command
            }
        } else {
            // client disconnected immediately
            closesocket(cs);
            return;
        }
    }

    auto TRACE_LOG = [&](LogLevel lvl, const std::string& msg) { log_msg(lvl, msg, trace_id); };

    std::string current_name = DEFAULT_FN;
    std::string current_path = path_for(current_name);
    int fd = open_rw_create(current_path);
    if (fd < 0) { send_all(cs, "ERR\n", 4); closesocket(cs); return; }

    while (true) {
        std::string line;

        // If we have a pending first command, use it; otherwise read a new one.
        if (!pending.empty()) {
            line.swap(pending);
        } else {
            if (!recv_line(cs, line)) {
                LOGI("Client disconnected cleanly");
                break;
            }
            if (line.empty()) continue; // ignore blank lines
        }

        size_t p1 = line.find(' ');
        std::string cmd = (p1 == std::string::npos) ? line : line.substr(0, p1);

        if (cmd == "OPEN") {
            std::string name = (p1 == std::string::npos) ? "" : line.substr(p1 + 1);
            TRACE_LOG(LogLevel::INFO, "OPEN " + name);
            if (fd >= 0) _close(fd);
            current_name = name;
            current_path = path_for(current_name);
            fd = open_rw_create(current_path);
            cache_for(current_name);
            send_all(cs, "OK\n", 3);

        } else if (cmd == "LIST") {
            TRACE_LOG(LogLevel::INFO, "LIST requested");
            auto payload = list_files_payload();
            std::string hdr = "OK " + std::to_string(payload.size()) + "\n";
            send_all(cs, hdr.c_str(), (int)hdr.size());
            if (!payload.empty()) send_all(cs, payload.c_str(), (int)payload.size());

        } else if (cmd == "STAT") {
            std::string name = (p1 == std::string::npos) ? "" : line.substr(p1 + 1);
            long long sz = file_size_bytes(name);
            TRACE_LOG(LogLevel::INFO, "STAT " + name + " = " + std::to_string(sz));
            if (sz < 0) { send_all(cs, "ERR\n", 4); continue; }
            std::string hdr = "OK " + std::to_string(sz) + "\n";
            send_all(cs, hdr.c_str(), (int)hdr.size());

        } else if (cmd == CMD_READ) {
            size_t p2 = line.find(' ', p1 + 1);
            long long off = std::stoll(line.substr(p1 + 1, p2 - (p1 + 1)));
            long long len = std::stoll(line.substr(p2 + 1));
            TRACE_LOG(LogLevel::INFO, "READ " + current_name + " off=" + std::to_string(off) + " len=" + std::to_string(len));
            std::vector<char> bytes;
            if (!do_read(fd, current_name, off, len, bytes, trace_id)) { send_all(cs, "ERR\n", 4); continue; }
            std::string hdr = "OK " + std::to_string(bytes.size()) + "\n";
            send_all(cs, hdr.c_str(), (int)hdr.size());
            if (!bytes.empty()) send_all(cs, bytes.data(), (int)bytes.size());

        } else if (cmd == CMD_WRITE) {
            size_t p2 = line.find(' ', p1 + 1);
            long long off = std::stoll(line.substr(p1 + 1, p2 - (p1 + 1)));
            long long len = std::stoll(line.substr(p2 + 1));
            TRACE_LOG(LogLevel::INFO, "WRITE " + current_name + " off=" + std::to_string(off) + " len=" + std::to_string(len));
            std::vector<char> tmp((size_t)len);
            if (!recv_n(cs, tmp.data(), (int)len)) { send_all(cs, "ERR\n", 4); continue; }
            if (!do_write(fd, current_name, off, tmp.data(), len, trace_id)) { send_all(cs, "ERR\n", 4); continue; }
            std::string hdr = "OK " + std::to_string(len) + "\n";
            send_all(cs, hdr.c_str(), (int)hdr.size());

        } else if (cmd == "DELETE") {
            std::string name = (p1 == std::string::npos) ? "" : line.substr(p1 + 1);
            TRACE_LOG(LogLevel::WARN, "DELETE " + name);
            bool deleting_current = (name == current_name);
            if (deleting_current && fd >= 0) { _close(fd); fd = -1; }
            bool ok = delete_file_and_cache(name, trace_id);
            if (deleting_current) {
                current_name = DEFAULT_FN;
                current_path = path_for(current_name);
                fd = open_rw_create(current_path);
            }
            send_all(cs, ok ? "OK\n" : "ERR\n", 3);

        } else if (cmd == "LISTTRASH") {
            TRACE_LOG(LogLevel::INFO, "LISTTRASH requested");
            auto payload = list_trash_payload();
            std::string hdr = "OK " + std::to_string(payload.size()) + "\n";
            send_all(cs, hdr.c_str(), (int)hdr.size());
            if (!payload.empty()) send_all(cs, payload.c_str(), (int)payload.size());
        } else if (cmd == "TRASH") {
            std::string name = line.substr(p1 + 1);
            TRACE_LOG(LogLevel::WARN, "TRASH " + name);

            std::string src = path_for(name);
            std::string trashDir = DATA_DIR + "/.trash";
            if (!fs::exists(trashDir)) fs::create_directories(trashDir);

            // generate a unique name if it already exists
            std::string dst = trashDir + "/" + name;
            std::error_code ec;
            int counter = 1;
            fs::path namePath(name);
            std::string base = namePath.stem().string();
            std::string ext = namePath.extension().string();
            while (fs::exists(dst)) {
                dst = trashDir + "/" + base + " (" + std::to_string(counter++) + ")" + ext;
            }

            fs::rename(src, dst, ec);
            if (ec) {
                TRACE_LOG(LogLevel::ERR, "Failed to move to trash: " + ec.message());
                send_all(cs, "ERR\n", 4);
            } else {
                TRACE_LOG(LogLevel::INFO, "✅ Moved to trash: " + dst);
                send_all(cs, "OK\n", 3);
            }
        } else if (cmd == "RESTORE") {
            std::string name = line.substr(p1 + 1);
            TRACE_LOG(LogLevel::INFO, "RESTORE " + name);

            std::string trashDir = DATA_DIR + "/.trash";
            std::string src = trashDir + "/" + name;

            // Generate a collision-safe destination name
            fs::path namePath(name);
            std::string base = namePath.stem().string();
            std::string ext  = namePath.extension().string();
            std::string dst  = DATA_DIR + "/" + name;

            int counter = 1;
            while (fs::exists(dst)) {
                dst = DATA_DIR + "/" + base + " (" + std::to_string(counter++) + ")" + ext;
            }

            std::error_code ec;
            fs::rename(src, dst, ec);
            if (ec) {
                TRACE_LOG(LogLevel::ERR, "Failed to restore: " + ec.message());
                send_all(cs, "ERR\n", 4);
            } else {
                TRACE_LOG(LogLevel::INFO, "♻️ Restored to: " + dst);
                send_all(cs, "OK\n", 3);
            }
        } else if (cmd == "PURGETRASH") {
            std::string name = line.substr(p1 + 1);
            TRACE_LOG(LogLevel::INFO, "PURGETRASH " + name);

            std::string path = DATA_DIR + "/.trash/" + name;
            std::error_code ec;
            fs::remove(path, ec);
            if (ec) {
                TRACE_LOG(LogLevel::ERR, "Failed to purge: " + ec.message());
                send_all(cs, "ERR\n", 4);
            } else {
                TRACE_LOG(LogLevel::INFO, "🧹 Permanently deleted: " + name);
                send_all(cs, "OK\n", 3);
            }
        } else {
            TRACE_LOG(LogLevel::ERR, "Unknown command: " + cmd);
            send_all(cs, "ERR\n", 4);
        }
    }

    if (fd >= 0) _close(fd);
    closesocket(cs);
    LOGI("Client disconnected");
}


int main(int argc, char* argv[]) {
    if (argc > 1) DATA_DIR = argv[1];
    set_data_dir_from_env();

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { std::cerr << "WSAStartup failed\n"; return 1; }

    SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
    int yes = 1; setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char*)&yes, sizeof(yes));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(SERVER_PORT);
    inet_pton(AF_INET, SERVER_ADDR.c_str(), &addr.sin_addr);

    if (bind(s, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) { std::cerr << "bind() failed\n"; return 1; }
    if (listen(s, SOMAXCONN) == SOCKET_ERROR) { std::cerr << "listen() failed\n"; return 1; }

    LOGI("🚀 Server started on " + SERVER_ADDR + ":" + std::to_string(SERVER_PORT));
    LOGI("📂 Data directory: " + DATA_DIR);

    while (true) {
        SOCKET cs = accept(s, nullptr, nullptr);
        if (cs == INVALID_SOCKET) continue;
        std::thread(handle_client, cs).detach();
    }
    return 0;
}
