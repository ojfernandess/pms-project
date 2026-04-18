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
        # -> Input email and password, then click login button to authenticate
        frame = context.pages[-1]
        # Input email for login
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('odairjosfernandess@ymail.com')
        

        frame = context.pages[-1]
        # Input password for login
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/div[2]/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('odair10')
        

        frame = context.pages[-1]
        # Click login button to submit credentials
        elem = frame.locator('xpath=html/body/div/div[2]/div/div[2]/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Ver Estabelecimentos' to view establishments for the test company
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button to view establishments
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on the first establishment 'Building Test 001' to configure OTA channel
        frame = context.pages[-1]
        # Click on 'Building Test 001' establishment to open details
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Minhas Empresas' to navigate to company list and then access establishment OTA channel settings
        frame = context.pages[-1]
        # Click 'Minhas Empresas' to go to company list
        elem = frame.locator('xpath=html/body/div/div[2]/aside/nav/a').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Ver Estabelecimentos' button to view establishments for the test company
        frame = context.pages[-1]
        # Click 'Ver Estabelecimentos' button to view establishments
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Building Test 001' establishment to open its details and access OTA channel configuration
        frame = context.pages[-1]
        # Click on 'Building Test 001' establishment to open details
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div/div[2]/div/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Channel Manager' menu item to access OTA channel configuration
        frame = context.pages[-1]
        # Click 'Channel Manager' to access OTA channel configuration
        elem = frame.locator('xpath=html/body/div/div[2]/aside/nav/a[9]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Novo Canal' button to start configuring Booking.com OTA channel with valid credentials
        frame = context.pages[-1]
        # Click 'Novo Canal' to add a new OTA channel
        elem = frame.locator('xpath=html/body/div/div[2]/div/main/div/div[2]/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Select 'Booking.com' from OTA dropdown, input API Key and Secret, set commission rate, enable channel and auto-sync, then create channel
        frame = context.pages[-1]
        # Open OTA dropdown to select Booking.com
        elem = frame.locator('xpath=html/body/div[3]/form/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Select 'Booking.com' from the OTA dropdown to proceed with configuration
        frame = context.pages[-1]
        # Select 'Booking.com' from OTA dropdown
        elem = frame.locator('xpath=html/body/div[4]/div/div/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Input API Key and API Secret, set commission rate to 15, enable 'Canal Ativo' and 'Sincronização Automática', then click 'Criar' to create OTA channel configuration
        frame = context.pages[-1]
        # Input API Key with provided username
        elem = frame.locator('xpath=html/body/div[3]/form/div[2]/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('odairjosfernandess@ymail.com')
        

        frame = context.pages[-1]
        # Input API Secret with provided password
        elem = frame.locator('xpath=html/body/div[3]/form/div[3]/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('odair10')
        

        frame = context.pages[-1]
        # Set commission rate to 15%
        elem = frame.locator('xpath=html/body/div[3]/form/div[4]/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('15')
        

        frame = context.pages[-1]
        # Enable 'Canal Ativo' switch
        elem = frame.locator('xpath=html/body/div[3]/form/div[5]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        frame = context.pages[-1]
        # Enable 'Sincronização Automática' switch
        elem = frame.locator('xpath=html/body/div[3]/form/div[6]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        frame = context.pages[-1]
        # Click 'Criar' button to create OTA channel configuration
        elem = frame.locator('xpath=html/body/div[3]/form/div[7]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        try:
            await expect(frame.locator('text=OTA Channel Synchronization Successful').first).to_be_visible(timeout=1000)
        except AssertionError:
            raise AssertionError("Test case failed: OTA channel synchronizations did not update availability and pricing correctly or reservations were not imported as expected.")
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    