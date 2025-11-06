// client.cpp
// 8-thread benchmark client for the NFS-style server at 127.0.0.1:9090
// Workload: READ-HEAVY (80% READ, 20% WRITE), total 10,000 operations.

#include "common.hpp"

#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <mutex>
#include <numeric>
#include <random>
#include <string>
#include <thread>
#include <vector>

using Clock = std::chrono::steady_clock;

static const int THREADS = 8;
static const int TOTAL_OPS = 10000;
static const int OPS_PER_THREAD = TOTAL_OPS / THREADS;

// Match the 1 MB backing file we created earlier
static const int STORE_SIZE = 1 << 20; // 1,048,576 bytes
static const int MAX_IO_LEN  = 4096;   // up to 4 KB per op

// --- socket utils ---
static bool send_all(SOCKET s, const char* buf, int len) {
    int sent = 0;
    while (sent < len) {
        int n = send(s, buf + sent, len - sent, 0);
        if (n <= 0) return false;
        sent += n;
    }
    return true;
}

static bool recv_n(SOCKET s, char* buf, int len) {
    int got = 0;
    while (got < len) {
        int n = recv(s, buf + got, len - got, 0);
        if (n <= 0) return false;
        got += n;
    }
    return true;
}

static bool recv_line(SOCKET s, std::string& out) {
    out.clear();
    char c;
    while (true) {
        int n = recv(s, &c, 1, 0);
        if (n <= 0) return false;
        if (c == '\n') break;
        out.push_back(c);
        if (out.size() > 1024) return false; // sanity
    }
    return true;
}

// --- one thread's workload ---
struct ThreadStats {
    int ops_done = 0;
    int reads = 0;
    int writes = 0;
    int errors = 0;
    double avg_us = 0.0; // average per-op latency in microseconds
};

static void worker(int id, ThreadStats& out) {
    // connect
    SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(SERVER_PORT);
    inet_pton(AF_INET, SERVER_ADDR.c_str(), &addr.sin_addr);

    if (connect(s, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        std::cerr << "[thread " << id << "] connect() failed\n";
        out.errors = OPS_PER_THREAD;
        return;
    }

    // random generators (thread-local)
    std::mt19937_64 rng(0xC0FFEE ^ (uint64_t)id * 1315423911ULL);
    std::uniform_int_distribution<int> lenDist(1, MAX_IO_LEN);
    std::uniform_int_distribution<int> offDist(0, STORE_SIZE - MAX_IO_LEN);
    std::uniform_real_distribution<double> kindDist(0.0, 1.0);

    std::vector<double> lat_us;
    lat_us.reserve(OPS_PER_THREAD);

    for (int i = 0; i < OPS_PER_THREAD; ++i) {
        const int len = lenDist(rng);
        const int off = offDist(rng);
        const bool do_read = (kindDist(rng) < 0.80); // 80% reads

        auto t0 = Clock::now();

        if (do_read) {
            // Send: READ <off> <len>\n
            std::string cmd = CMD_READ + std::string(" ") + std::to_string(off) +
                              " " + std::to_string(len) + "\n";
            if (!send_all(s, cmd.c_str(), (int)cmd.size())) { out.errors++; break; }

            // Expect: "OK <n>\n" then <n bytes>
            std::string line;
            if (!recv_line(s, line)) { out.errors++; break; }
            if (line.rfind("OK ", 0) != 0) { out.errors++; break; }
            int n = std::stoi(line.substr(3));
            std::vector<char> buf(n);
            if (n > 0 && !recv_n(s, buf.data(), n)) { out.errors++; break; }

            out.reads++;
        } else {
            // Write op
            std::vector<char> data(len);
            for (int j = 0; j < len; ++j) data[j] = char((off + j + id) & 0xFF);

            std::string cmd = CMD_WRITE + std::string(" ") +
                              std::to_string(off) + " " +
                              std::to_string(len) + "\n";
            if (!send_all(s, cmd.c_str(), (int)cmd.size())) { out.errors++; break; }
            if (!send_all(s, data.data(), len)) { out.errors++; break; }

            std::string line;
            if (!recv_line(s, line)) { out.errors++; break; }
            if (line.rfind("OK ", 0) != 0) { out.errors++; break; }
            int ack = std::stoi(line.substr(3));
            if (ack != len) { out.errors++; break; }

            out.writes++;
        }

        auto t1 = Clock::now();
        double us = std::chrono::duration<double, std::micro>(t1 - t0).count();
        lat_us.push_back(us);
        out.ops_done++;
    }

    if (!lat_us.empty()) {
        double sum = std::accumulate(lat_us.begin(), lat_us.end(), 0.0);
        out.avg_us = sum / (double)lat_us.size();
    }

    closesocket(s);
}

int main() {
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2,2), &wsa) != 0) {
        std::cerr << "WSAStartup failed\n";
        return 1;
    }

    std::vector<std::thread> threads;
    std::vector<ThreadStats> stats(THREADS);

    auto t0 = Clock::now();
    for (int i = 0; i < THREADS; ++i) {
        threads.emplace_back(worker, i, std::ref(stats[i]));
    }
    for (auto& th : threads) th.join();
    auto t1 = Clock::now();

    int total_ops=0, total_reads=0, total_writes=0, total_errors=0;
    double sum_lat = 0.0;

    for (int i = 0; i < THREADS; ++i) {
        total_ops += stats[i].ops_done;
        total_reads += stats[i].reads;
        total_writes += stats[i].writes;
        total_errors += stats[i].errors;
        sum_lat += stats[i].avg_us * stats[i].ops_done;
    }

    double avg_us = (total_ops > 0) ? (sum_lat / total_ops) : 0.0;
    double sec = std::chrono::duration<double>(t1 - t0).count();
    double ops_sec = (sec > 0) ? total_ops / sec : 0.0;

    std::cout << "\n=== Per-thread stats ===\n";
    for (int i = 0; i < THREADS; ++i) {
        std::cout << "Thread " << i << ": ops=" << stats[i].ops_done
                  << " (R=" << stats[i].reads
                  << ", W=" << stats[i].writes
                  << ", err=" << stats[i].errors
                  << "), avg=" << (int)stats[i].avg_us << " us\n";
    }

    std::cout << "\n=== Aggregate ===\n";
    std::cout << "Total ops    : " << total_ops
              << " (reads=" << total_reads
              << ", writes=" << total_writes
              << ", errors=" << total_errors << ")\n";
    std::cout << "Total time   : " << sec << " s\n";
    std::cout << "Avg latency  : " << (int)avg_us << " us/op\n";
    std::cout << "Throughput   : " << (int)ops_sec << " ops/sec\n";

    WSACleanup();
    return 0;
}
