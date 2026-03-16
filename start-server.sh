#!/bin/bash
export NODE_PATH=/tmp/my_node_modules/node_modules
node server.js &
echo \$! > server.pid
