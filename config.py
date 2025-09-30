import os

# 环境变量配置

# 判断是否在Render平台上运行
IS_RENDER = os.environ.get('RENDER', False)

# 数据库URL配置
# 如果在Render平台上运行，使用环境变量中的数据库路径
# 否则使用本地路径
if IS_RENDER:
    # Render平台上的数据库路径
    DATABASE_URL = "sqlite:///./database/asset.db"
    # 确保数据库目录存在
    os.makedirs("./database", exist_ok=True)
else:
    # 本地开发环境的数据库路径
    DATABASE_URL = "sqlite:///./database/asset.db"

# 管理员密码配置
# 优先使用环境变量中的密码，如果没有设置则使用默认密码
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

# 端口配置
# 优先使用环境变量中的端口，如果没有设置则使用默认端口8009
PORT = int(os.environ.get('PORT', 8009))