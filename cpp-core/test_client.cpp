#include <winsock2.h>
#include <ws2tcpip.h>
#include <iostream>
#include <string>
#pragma comment(lib, "ws2_32.lib")

int main() {
    WSADATA wsa; WSAStartup(MAKEWORD(2,2), &wsa);
    SOCKET s = socket(AF_INET, SOCK_STREAM, 0);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9090);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if(connect(s, (sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cout << "connect fail\n";
        return 0;
    }

    auto sendline = [&](const std::string& l) {
        send(s, l.c_str(), (int)l.size(), 0);
    };

    // 1) switch to a new file
    sendline("OPEN photo\n");

    // 2) write 4 bytes
    const char data[4] = { 'N','E','T','A' };
    sendline("WRITE 0 4\n");
    send(s, data, 4, 0);

    // 3) read back
    sendline("READ 0 4\n");

    // print server responses
    char buf[128];
    int n = recv(s, buf, sizeof(buf)-1, 0);
    buf[n] = 0;
    std::cout << "[SERVER RESP] " << buf << "\n";

    n = recv(s, buf, sizeof(buf)-1, 0);
    buf[n] = 0;
    std::cout << "[SERVER DATA] " << buf << "\n";

    closesocket(s);
    WSACleanup();
    return 0;
}
