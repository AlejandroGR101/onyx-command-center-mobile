import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5000";

test("login con credenciales válidas entra al dashboard", async ({ page }) => {
  await page.goto(BASE);
  await page.getByTestId("login-username").fill("Admin");
  await page.getByTestId("login-password").fill("OnyxCCD");
  await page.getByTestId("login-submit").click();
  // Tras login, el login form desaparece
  await expect(page.getByTestId("login-submit")).toHaveCount(0, { timeout: 10000 });
});

test("login con credenciales inválidas muestra error", async ({ page }) => {
  await page.goto(BASE);
  await page.getByTestId("login-username").fill("Admin");
  await page.getByTestId("login-password").fill("wrong-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible({ timeout: 10000 });
});
