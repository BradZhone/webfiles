#!/bin/bash
# Web VSCode 启动脚本

cd /home/brad/web-vscode

echo "正在启动 Web VSCode 服务器..."
echo "端口: 8765"
echo "访问地址: http://<服务器IP>:8765"
echo ""

# 检查是否已在运行
if lsof -i:8765 > /dev/null 2>&1; then
    echo "警告: 端口 8765 已被占用"
    echo "请先停止现有服务或更改端口"
    exit 1
fi

# 启动服务
node server.js
