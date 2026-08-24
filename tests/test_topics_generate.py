"""接口自动化测试：选题生成（正常流程，走 mock DeepSeek，不花钱）
前置：后端以 DEEPSEEK_BASE_URL=http://127.0.0.1:9999 启动，并运行 tests/mock_deepseek.py
"""
import requests

BASE = "http://localhost:3000"


def test_topics_generate_returns_5():
    """正常输入 → 应该返回 5 个选题，每个含 title/angle/why/tags"""
    r = requests.post(f"{BASE}/api/topics",
                      json={"positioning": "二次元手办", "platform": "douyin"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data["topics"]) == 5          # 规定：返回 5 个选题
    first = data["topics"][0]
    assert "title" in first                  # 每条必须有标题
    assert "angle" in first                  # 创作角度
    assert "why" in first                    # 为什么适合
    assert "tags" in first                   # 话题标签
    assert isinstance(first["tags"], list)   # tags 是数组
