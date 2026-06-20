#!/bin/bash
# 服务器监控脚本

echo "=================================================="
echo "          🕵️  服务器监控"
echo "=================================================="
echo ""

SERVER_URL="http://127.0.0.1:8080"
LOG_DIR="./logs"

mkdir -p "$LOG_DIR"

check_server() {
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    local status="UNKNOWN"
    local response=""
    
    if response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health"); then
        if [ "$response" = "200" ]; then
            status="✅ ONLINE"
        else
            status="⚠️  ERROR ($response)"
        fi
    else
        status="❌ OFFLINE"
    fi
    
    echo "[$timestamp] $status"
    echo "[$timestamp] $status" >> "$LOG_DIR/monitor.log"
}

echo "开始监控服务器..."
echo "按 Ctrl+C 停止监控"
echo ""

check_server

# 每5分钟检查一次
while true; do
    sleep 300  # 5分钟
    check_server
done
