"""接口自动化测试：选题生成接口（/api/topics）
注意：这里只测「不会调用 AI」的参数校验场景，正常生成留到 mock 课时测。
"""
import pytest
import requests

BASE = "http://localhost:3000"

@pytest.mark.parametrize("body", [
    {"positioning": "", "platform": "douyin"},          # 场景1：定位为空
    {"positioning": "二次元手办"},                       # 场景2：缺少平台
    {"positioning": "二次元手办", "platform": "xxx"},     # 场景3：非法平台
])
def test_topics_param_error(body):
    """参数缺失/非法 → 应该返回 400"""
    r = requests.post(f"{BASE}/api/topics", json=body, timeout=30)
    assert r.status_code == 400
