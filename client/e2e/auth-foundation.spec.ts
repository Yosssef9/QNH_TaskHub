import { expect, test } from '@playwright/test'

const authenticatedUserResponse = {
  success: true,
  data: {
    user: {
      userId: 1,
      userCode: 'TEST001',
      userName: 'مستخدم تجريبي',
      email: 'test@qnhospital.com',
    },
    access: { roleCode: 'ADMIN', contractsEnabled: false },
    preferences: {
      languageCode: 'AR',
      theme: 'SYSTEM',
      sidebarCollapsed: false,
      timezone: 'Asia/Riyadh',
      meetingStartReminderEnabled: true,
      timeFormat: '12H',
    },
  },
}

async function prepareAuthenticatedPage(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: authenticatedUserResponse })
  })
  await page.route('**/api/users/me/preferences', async (route) => {
    const input = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      json: {
        success: true,
        data: {
          preferences: {
            ...authenticatedUserResponse.data.preferences,
            ...input,
          },
        },
      },
    })
  })
  await page.route('**/api/lists', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          lists: [
            {
              id: 1,
              name: 'My Tasks',
              iconKey: 'list-todo',
              color: '#2563EB',
              isDefault: true,
              displayOrder: 0,
            },
          ],
        },
      },
    })
  })
  await page.addInitScript(() => window.localStorage.setItem('token', 'test-portal-token'))
}

async function expectDialogCentered(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  const viewport = page.viewportSize()

  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!box || !viewport) return

  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2)
}

test('requires the application to be opened from QNH Portal', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'يلزم تسجيل الدخول عبر بوابة QNH' })).toBeVisible()

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
})

test('supports the Arabic-first desktop shell and English direction', async ({ page }) => {
  await prepareAuthenticatedPage(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'مرحباً مستخدم تجريبي' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible()

  const desktopSidebar = page.locator('aside[aria-label="التنقل الرئيسي"]')
  const desktopNavigation = desktopSidebar.getByRole('navigation', {
    name: 'التنقل الرئيسي',
  })
  const pageContent = page.locator('main')
  await expect(desktopSidebar).toHaveCSS('width', '80px')
  await expect(desktopNavigation).toHaveCSS('overflow-x', 'hidden')
  const collapsedContentWidth = (await pageContent.boundingBox())?.width
  await desktopSidebar.hover()
  await expect(desktopSidebar).toHaveCSS('width', '288px')
  await expect(page.getByRole('link', { name: 'مهامي' })).toBeVisible()
  await expect
    .poll(async () => (await pageContent.boundingBox())?.width)
    .toBeLessThan(collapsedContentWidth ?? 0)
  const homeLink = page.getByRole('link', { name: 'الرئيسية' })
  await expect(homeLink).toBeVisible()
  await homeLink.click()
  await expect(desktopSidebar).toHaveCSS('width', '80px')
  await page.waitForTimeout(250)
  await expect(desktopSidebar).toHaveCSS('width', '80px')

  await pageContent.hover()
  await desktopSidebar.hover()
  await expect(desktopSidebar).toHaveCSS('width', '288px')
  await pageContent.hover()
  await expect(desktopSidebar).toHaveCSS('width', '80px')

  await page.getByRole('button', { name: 'التبديل إلى الإنجليزية' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page.getByRole('heading', { name: 'Welcome, مستخدم تجريبي' })).toBeVisible()
})

test('opens the navigation as a mobile drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepareAuthenticatedPage(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'فتح القائمة الجانبية' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible()
})

test('uses customized theme-aware application scrollbars', async ({ page }) => {
  await prepareAuthenticatedPage(page)
  await page.goto('/')

  const lightStyles = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    const webkitScrollbar = getComputedStyle(document.documentElement, '::-webkit-scrollbar')
    return {
      color: styles.scrollbarColor,
      width: styles.scrollbarWidth,
      webkitWidth: webkitScrollbar.width,
    }
  })

  expect(lightStyles.width).toBe('thin')
  expect(lightStyles.color).not.toBe('auto')
  expect(lightStyles.webkitWidth).toBe('10px')

  await page.getByRole('button', { name: 'تغيير المظهر' }).click()
  await page.getByRole('button', { name: 'داكن' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  const darkColor = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollbarColor,
  )
  expect(darkColor).not.toBe(lightStyles.color)
})

test('creates a private custom list from the sidebar', async ({ page }) => {
  await prepareAuthenticatedPage(page)
  let savedInput: unknown = null

  await page.route('**/api/lists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }

    savedInput = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          list: {
            id: 2,
            name: 'مهام العمل',
            iconKey: 'target',
            color: '#0D9488',
            isDefault: false,
            displayOrder: 1,
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.locator('aside[aria-label="التنقل الرئيسي"]').hover()
  await page.getByRole('button', { name: 'إنشاء قائمة' }).click()
  await expectDialogCentered(page)
  await page.getByLabel('اسم القائمة').fill('مهام العمل')
  await page.getByRole('button', { name: 'هدف' }).click()
  await page.getByRole('button', { name: 'اختيار اللون #0D9488' }).click()
  await page.getByRole('button', { name: 'حفظ' }).click()

  await expect
    .poll(() => savedInput)
    .toEqual({
      name: 'مهام العمل',
      iconKey: 'target',
      color: '#0D9488',
    })
  await expect(page.getByText('تم إنشاء القائمة.')).toBeVisible()

  await page.locator('aside[aria-label="التنقل الرئيسي"]').hover()
  await page.getByRole('button', { name: 'إدارة القوائم' }).click()
  await expectDialogCentered(page)
})

test('allows an administrator to grant TaskHub access with a role', async ({ page }) => {
  await prepareAuthenticatedPage(page)
  let savedInput: unknown = null

  await page.route('**/api/admin/access/users*', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              userId: 42,
              userCode: '0042',
              userName: 'مستخدم جديد',
              email: null,
              portalIsActive: true,
              roleCode: null,
              accessIsActive: false,
              contractsEnabled: false,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        },
      },
    })
  })
  await page.route('**/api/admin/access/users/*', async (route) => {
    savedInput = route.request().postDataJSON()
    await route.fulfill({
      json: {
        success: true,
        data: {
          user: {
            userId: 42,
            userCode: '0042',
            userName: 'مستخدم جديد',
            email: null,
            portalIsActive: true,
            roleCode: 'ADMIN',
            accessIsActive: true,
            contractsEnabled: false,
          },
        },
      },
    })
  })

  await page.goto('/admin/access')
  await expect(page.getByRole('heading', { name: 'إدارة الوصول' })).toBeVisible()

  await page.getByRole('button', { name: 'تعديل وصول مستخدم جديد' }).click()
  await page.getByRole('combobox', { name: 'الدور' }).click()
  await page.getByRole('option', { name: 'مسؤول النظام' }).click()
  await page.getByRole('button', { name: 'حفظ' }).click()

  await expect.poll(() => savedInput).toEqual({ roleCode: 'ADMIN', isActive: true, contractsEnabled: false })
  await expect(page.getByText('تم حفظ إعدادات الوصول.')).toBeVisible()
})



