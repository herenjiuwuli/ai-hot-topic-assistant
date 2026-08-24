"""接口自动化测试：热榜相关接口
运行方式：先启动后端(npm run dev 或 node server/dev.js)，再执行：
  .venv/Scripts/python.exe -m pytest tests/ -v
"""
import requests

# 测试本地后端；如果测线上，改成线上链接即可
BASE = "http://localhost:3000"


def test_health():
    """健康检查接口应该返回 ok"""
    r = requests.get(f"{BASE}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_hotlist_douyin():
    """抖音热榜应返回 200，且有数据"""
    r = requests.get(f"{BASE}/api/hotlist?platform=douyin", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] > 0  # 有数据
    first = data["items"][0]
    # 每条数据都应该有这 4 个字段（归一化后的统一格式）
    assert "title" in first
    assert "hot" in first
    assert "rank" in first
    assert "url" in first


def test_hotlist_rednote():
    """小红书热榜也应返回 200 且有数据"""
    r = requests.get(f"{BASE}/api/hotlist?platform=rednote", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] > 0

def test_hotlist_bili():
    """哔哩哔哩热榜也应返回 200 且有数据"""
    r = requests.get(f"{BASE}/api/hotlist?platform=bili", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] > 0


def test_hotlist_invalid_platform():
    """非法平台应该返回 400"""
    r = requests.get(f"{BASE}/api/hotlist?platform=xxx", timeout=10)
    assert r.status_code == 400
