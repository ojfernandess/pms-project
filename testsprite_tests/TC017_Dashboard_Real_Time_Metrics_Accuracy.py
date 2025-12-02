import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:8080", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # -> Try to find a login or navigation element or refresh the page to load content.
        await page.goto('http://localhost:8080/', timeout=10000)
        await asyncio.sleep(3)
        

        # -> Try to find a login or navigation element or refresh the page to load content.
        await page.goto('http://localhost:8080/login', timeout=10000)
        await asyncio.sleep(3)
        

        # -> Click the 'Return to Home' link to try to access the home or main dashboard page.
        frame = context.pages[-1]
        # Click 'Return to Home' link on 404 error page
        elem = frame.locator('xpath=html/body/div/div[2]/div/a').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Input email and password, then click 'Entrar' to log in.
        frame = context.pages[-1]
        # Input email in login form
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('odairjosfernandess@ymail.com')
        

        frame = context.pages[-1]
        # Input password in login form
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/div[2]/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('Soberano1992@')
        

        frame = context.pages[-1]
        # Click 'Entrar' button to submit login form
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Ver Estabelecimentos' button to view establishments and access hotel dashboard metrics.
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button for 'Empresa teste'
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on the first hotel 'Building Test 001' to open its dashboard and verify occupancy, revenue, and recent reservations.
        frame = context.pages[-1]
        # Click on 'Building Test 001' hotel to open its dashboard
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Verify occupancy chart data matches current reservations and room statuses, verify revenue figures, and verify recent reservations list.
        frame = context.pages[-1]
        # Click 'Minhas Empresas' to navigate and verify if there are any active reservations or room statuses to compare occupancy data.
        elem = frame.locator('xpath=html/body/div/div[2]/aside/nav/a').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Ver Estabelecimentos' button for 'Empresa teste' to check establishments and verify occupancy and reservations data.
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button for 'Empresa teste'
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Building Test 001' hotel to open its dashboard and verify metrics.
        frame = context.pages[-1]
        # Click on 'Building Test 001' hotel to open its dashboard
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        await expect(frame.locator('text=Taxa de Ocupação').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=0% (0 de 0 quartos)').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Faturamento Hoje').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=R$ 0,00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Check-ins Hoje').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=0 (0 pendentes)').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=RevPAR').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=R$ 0,00').nth(1)).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Próximas Chegadas').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Nenhuma chegada prevista').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Alertas').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Sistema funcionando normalmente').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Última sincronização: agora').first).to_be_visible(timeout=30000)
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    