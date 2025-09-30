#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
启动脚本 - 用于启动FastAPI应用
"""

import uvicorn
from config import PORT

if __name__ == "__main__":
    print(f" ✅ 应用启动完成！\n 🌐 服务器地址: http://localhost:{PORT}")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)