# 🕒 6小时持续运行指南

## ✅ 当前状态

- **服务器状态**: 🟢 正常运行
- **启动时间**: 2026-06-06 17:23
- **访问地址**: http://127.0.0.1:8080

---

## 🎯 方案1：使用当前运行的服务器（简单）

你的服务器已经在后台持续运行！你可以：

### 定期检查服务器状态
```bash
# 检查健康状态
curl http://127.0.0.1:8080/health

# 查看当前待办
curl http://127.0.0.1:8080/api/todos
```

### 如果服务器停止，重新启动
```bash
cd /workspace/project
npm start
```

---

## 🚀 方案2：使用 PM2（推荐，最稳定）

### 1. 安装 PM2
```bash
npm install -g pm2
```

### 2. 使用配置文件启动
```bash
cd /workspace/project
pm2 start ecosystem.config.cjs
```

### 3. 查看状态
```bash
pm2 status
pm2 logs todo-api
```

### 4. PM2 常用命令
```bash
pm2 stop todo-api      # 停止
pm2 restart todo-api   # 重启
pm2 delete todo-api    # 删除
pm2 monit              # 监控
```

---

## 🔧 方案3：使用 Nohup（简单）

```bash
cd /workspace/project
nohup npm start > app.log 2>&1 &
echo $! > app.pid

# 查看日志
tail -f app.log

# 停止
kill $(cat app.pid)
```

---

## 📊 监控服务器

### 使用我们的监控脚本
```bash
cd /workspace/project
chmod +x monitor.sh
./monitor.sh
```

### 或手动定期检查
```bash
# 每30分钟检查一次
watch -n 1800 'curl -s http://127.0.0.1:8080/health'
```

---

## 📝 6小时运行检查清单

- [x] 服务器已启动
- [ ] 每1小时检查一次健康状态
- [ ] 每2小时查看一次日志
- [ ] 确保没有内存泄漏
- [ ] 6小时后验证系统仍然正常

---

## 🌐 API 测试（可选）

```bash
# 每小时创建一个测试待办
curl -X POST -H "Content-Type: application/json" \
  -d "{\"title\":\"6hr Test - $(date)\",\"completed\":false}" \
  http://127.0.0.1:8080/api/todos
```

---

## 💡 提示

1. **不要关闭当前会话**，否则服务器会停止
2. 定期检查日志，确保没有错误
3. 6小时后，验证所有功能仍然正常
4. 如果需要停止，按 Ctrl+C

---

**祝运行顺利！** 🎉
