#!/bin/bash
# Web VSCode 管理脚本
#
# 环境变量配置:
#   WEB_VSCODE_PORT  - 服务端口 (默认: 8765)
#   WEB_VSCODE_HOME  - 文件根目录 (默认: $HOME)
#   WEB_VSCODE_SECRET - Session密钥 (默认: 自动生成)
#
# 或者在 config.json 中配置:
#   {
#     "port": 8765,
#     "homeDir": "/path/to/files",
#     "sessionSecret": "your-secret",
#     "passwordHash": "sha256-hash"
#   }

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"

# 配置 (优先使用环境变量)
PORT="${WEB_VSCODE_PORT:-8765}"
PID_FILE="$PROJECT_DIR/server.pid"

# 显示当前配置
show_config() {
    echo "当前配置:"
    echo "  项目目录: $PROJECT_DIR"
    echo "  端口: $PORT"
    echo "  文件根目录: ${WEB_VSCODE_HOME:-$HOME (默认)}"
    echo ""
}

case "$1" in
    start)
        if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "服务已在运行 (PID: $(cat $PID_FILE))"
            exit 0
        fi

        if lsof -i:$PORT > /dev/null 2>&1; then
            echo "错误: 端口 $PORT 已被占用"
            exit 1
        fi

        cd "$PROJECT_DIR"
        nohup node server.js > "$PROJECT_DIR/server.log" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 1

        if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "✅ 服务已启动"
            show_config
            echo "   日志: $PROJECT_DIR/server.log"
            echo "   PID:  $(cat $PID_FILE)"
        else
            echo "❌ 启动失败，请查看日志"
            cat "$PROJECT_DIR/server.log"
            rm -f "$PID_FILE"
        fi
        ;;

    stop)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 $PID 2>/dev/null; then
                kill $PID
                sleep 1
                if kill -0 $PID 2>/dev/null; then
                    kill -9 $PID
                fi
                echo "✅ 服务已停止"
            else
                echo "服务未运行"
            fi
            rm -f "$PID_FILE"
        else
            # 尝试通过端口查找并停止
            PID=$(lsof -t -i:$PORT 2>/dev/null)
            if [ -n "$PID" ]; then
                kill $PID
                echo "✅ 服务已停止 (PID: $PID)"
            else
                echo "服务未运行"
            fi
        fi
        ;;

    restart)
        $0 stop
        sleep 1
        $0 start
        ;;

    status)
        if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "✅ 服务运行中 (PID: $(cat $PID_FILE))"
            show_config
        else
            if lsof -i:$PORT > /dev/null 2>&1; then
                echo "⚠️  端口 $PORT 被其他进程占用"
            else
                echo "❌ 服务未运行"
            fi
        fi
        ;;

    logs)
        if [ -f "$PROJECT_DIR/server.log" ]; then
            tail -f "$PROJECT_DIR/server.log"
        else
            echo "日志文件不存在"
        fi
        ;;

    config)
        show_config
        ;;

    *)
        echo "Web VSCode 管理工具"
        echo ""
        echo "用法: $0 {start|stop|restart|status|logs|config}"
        echo ""
        echo "命令:"
        echo "  start   - 启动服务"
        echo "  stop    - 停止服务"
        echo "  restart - 重启服务"
        echo "  status  - 查看状态"
        echo "  logs    - 查看日志"
        echo "  config  - 显示当前配置"
        echo ""
        echo "环境变量:"
        echo "  WEB_VSCODE_PORT   - 服务端口 (默认: 8765)"
        echo "  WEB_VSCODE_HOME   - 文件根目录 (默认: \$HOME)"
        echo "  WEB_VSCODE_SECRET - Session密钥"
        exit 1
        ;;
esac
