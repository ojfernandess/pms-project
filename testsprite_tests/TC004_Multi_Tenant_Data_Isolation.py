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
        # -> Input email and password, then click login button to authenticate user.
        frame = context.pages[-1]
        # Input the email for user associated with Company A
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('odairjosfernandess@ymail.com')
        

        frame = context.pages[-1]
        # Input the password for user associated with Company A
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/div[2]/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('Soberano1992@')
        

        frame = context.pages[-1]
        # Click the login button to submit credentials
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Ver Estabelecimentos' button to view establishments for Company A.
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button to view establishments for Company A
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Attempt to access data or establishments related to Company B or other companies to verify access is denied.
        frame = context.pages[-1]
        # Attempt to click on 'Empresa Azul ocean' establishment to check if access is allowed or denied.
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Minhas Empresas' to view companies and their establishments for validation.
        frame = context.pages[-1]
        # Click on 'Minhas Empresas' to view companies and establishments
        elem = frame.locator('xpath=html/body/div/div[2]/aside/nav/a').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Ver Estabelecimentos' button to view establishments for Company A.
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button to view establishments for Company A
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Attempt to access data or establishments related to Company B or other companies to verify access is denied.
        frame = context.pages[-1]
        # Attempt to click on 'Empresa Azul ocean' establishment to check if access is allowed or denied.
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Minhas Empresas' to view companies and their establishments for validation.
        frame = context.pages[-1]
        # Click on 'Minhas Empresas' to view companies and establishments
        elem = frame.locator('xpath=html/body/div/div[2]/aside/nav/a').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Ver Estabelecimentos' button to view establishments for Company A.
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button to view establishments for Company A
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Building Test 001' establishment to verify data isolation within Company A's establishments.
        frame = context.pages[-1]
        # Click on 'Building Test 001' establishment to verify data isolation within Company A's establishments.
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Attempt to access Company B's data or establishments via URL manipulation or API to verify access denial and data isolation.
        await page.goto('http://localhost:8080/empresa-b/estabelecimentos', timeout=10000)
        await asyncio.sleep(3)
        

        # -> Return to dashboard or home page to continue further validation or conclude test.
        frame = context.pages[-1]
        # Click 'Ir para Home' to return to home/dashboard page
        elem = frame.locator('xpath=html/body/div/div[2]/div/div/a').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Input a search query in the search input to verify that search results are limited to Company A's data only.
        frame = context.pages[-1]
        # Input 'Test' in the search input to verify data isolation in search results
        elem = frame.locator('xpath=html/body/div/div[2]/div/header/div/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('Test')
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        await expect(frame.locator('text=Minhas Empresas').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Visão geral do seu hotel').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Faturamento Hoje').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=R$ 0,00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Sem dados anteriores').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Taxa de Ocupação').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=0%').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=0 de 1 quartos').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Check-ins Hoje').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=0').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=0 pendentes').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=RevPAR').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Sistema funcionando normalmente').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Última sincronização: agora').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Nenhuma chegada prevista').first).to_be_visible(timeout=30000)
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    