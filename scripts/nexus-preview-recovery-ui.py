"""Local synthetic recovery smoke; no customer account, messages or provider."""
import json
import re
from urllib.request import urlopen

from playwright.sync_api import sync_playwright, expect


def health():
    with urlopen("http://127.0.0.1:3119/health", timeout=10) as response:
        value = json.load(response)
    assert value["fixture"] is True and value["externalEffects"] is False
    return value


before = health()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    try:
        page = browser.new_page(locale="pt-BR")
        page.goto("http://localhost:3117/socialfy/demonstracao", wait_until="networkidle", timeout=60000)
        slot = page.get_by_role("button", name="10:30", exact=True)
        expect(slot).to_be_visible(timeout=30000)
        slot.click()
        expect(page.locator('input[name="name"]')).to_be_visible()
        page.locator('input[name="name"]').fill("Teste local de recuperação")
        page.locator('input[name="email"]').fill("processing@example.test")
        phone = page.locator('input[name="attendeePhoneNumber"]')
        phone.fill("")
        # The observed US mask preserves +1 when cleared; type national digits.
        phone.press_sequentially("2025550101", delay=30)
        assert re.sub(r"\D", "", phone.input_value()) == "12025550101", phone.input_value()
        page.get_by_role("checkbox", name="Autorizo mensagens de confirmação e lembretes sobre esta reserva.").check()
        page.get_by_role("button", name="Confirmar", exact=True).click()
        expect(page.get_by_text("Reserva em processamento", exact=True)).to_be_visible(timeout=30000)
        original = page.evaluate('sessionStorage.getItem("agenda-attempt-v1:1")')
        assert original and json.loads(original)["confirmed"] is False
        assert health()["calendarCalls"] == before["calendarCalls"] + 1
        buttons = page.get_by_role("button").all_text_contents()
        assert "Verificar reserva" in buttons and "Retomar formulário" in buttons
        with page.expect_response(lambda r: "/api/book/status?" in r.url) as lookup:
            page.get_by_role("button", name="Verificar reserva", exact=True).click()
        assert lookup.value.request.method == "GET"
        assert lookup.value.status == 200
        expect(page.get_by_text("Reserva em processamento", exact=True)).to_be_visible()
        page.reload(wait_until="networkidle", timeout=60000)
        expect(page.get_by_text("Reserva em processamento", exact=True)).to_be_visible()
        assert page.evaluate('sessionStorage.getItem("agenda-attempt-v1:1")') == original
        page.get_by_role("button", name="Retomar formulário", exact=True).click()
        expect(page.locator('input[name="name"]')).to_be_visible()
        assert page.evaluate('sessionStorage.getItem("agenda-attempt-v1:1")') == original
        assert health()["calendarCalls"] == before["calendarCalls"] + 1
        print("PASS: UI submit processing, read-only lookup, reload and resume preserve one attempt and one synthetic effect.")
    except Exception:
        print("Rendered UI after failure:", page.locator("body").inner_text()[:6000])
        raise
    finally:
        browser.close()
