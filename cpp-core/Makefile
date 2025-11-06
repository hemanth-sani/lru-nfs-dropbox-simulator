CXX=g++
CXXFLAGS=-std=c++17 -O2 -pthread
LDLIBS=-lws2_32

all: server client

server: server.cpp
	$(CXX) $(CXXFLAGS) -o server server.cpp $(LDLIBS)

client: client.cpp
	$(CXX) $(CXXFLAGS) -o client client.cpp $(LDLIBS)

clean:
	rm -f server client *.o

rebuild:
	make clean && make
