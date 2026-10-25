import { expect, test } from '@playwright/test'

// Parcourt toutes les pages avec la saison de démonstration : aucune erreur console, captures pour revue visuelle
test('pages avec données de démonstration', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto('/')
  await page.getByRole('button', { name: 'Charger la démo' }).click()
  await expect(page.getByText('Meilleurs joueurs').or(page.getByText('Leaders')).first()).toBeVisible()
  const shot = (name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png` })
  const bottom = async (name: string) => {
    await page.locator('main').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(400)
    await shot(name)
  }
  await page.waitForTimeout(600)
  await shot('01-accueil')

  await page.goto('/#/joueurs')
  await expect(page.getByRole('heading', { name: 'Joueurs' })).toBeVisible()
  await shot('02-joueurs')

  await page.locator('a[href^="#/joueurs/"]').first().click()
  await expect(page).toHaveURL(/#\/joueurs\/.+/)
  await page.waitForTimeout(600)
  await shot('03-fiche-joueur')
  await bottom('03b-fiche-joueur-bas')

  await page.goto('/#/matchs')
  await expect(page.getByText('2 victoires')).toBeVisible()
  await shot('04-matchs')

  await page.locator('a[href^="#/matchs/"]').filter({ hasText: /\d+\s*–\s*\d+/ }).first().click()
  await page.waitForTimeout(600)
  await shot('05-resume-match')
  await bottom('05b-resume-match-bas')
  await page.getByRole('button', { name: 'Graphiques' }).click()
  await page.waitForTimeout(500)
  await bottom('05c-resume-graphiques')
  await page.getByRole('button', { name: 'Tirs', exact: true }).click()
  await page.waitForTimeout(500)
  await bottom('05d-resume-tirs')
  await page.getByRole('button', { name: 'Déroulé' }).click()
  await page.waitForTimeout(300)
  await shot('05e-resume-deroule')

  await page.goto('/#/stats')
  await page.waitForTimeout(600)
  await shot('06-stats-equipe')
  await page.locator('main').evaluate((el) => el.scrollTo(0, 650))
  await page.waitForTimeout(400)
  await shot('06b-stats-equipe-milieu')
  await bottom('06c-stats-equipe-bas')

  await page.goto('/#/reglages')
  await shot('07-reglages')

  // Préparation d'un match à venir puis écran live
  await page.goto('/#/matchs')
  await page.getByRole('button', { name: /À venir/ }).click().catch(() => {})
  await page.locator('a[href^="#/matchs/"]').filter({ hasNotText: /\d+\s*–\s*\d+/ }).first().click()
  await page.getByRole('button', { name: 'Tout convoquer' }).click()
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Ajouter au cinq de départ' }).nth(i).click()
    await expect(page.getByText(`Cinq de départ (${i + 1}/5)`)).toBeVisible()
  }
  await shot('08-preparation')
  await page.getByRole('button', { name: 'Démarrer le match' }).click()
  await expect(page.getByTestId('live')).toBeVisible()
  await page.getByTestId('oncourt-' + (await page.locator('[data-testid^="oncourt-"]').first().getAttribute('data-testid'))!.split('-')[1]).click()
  await shot('09-live-joueur-selectionne')
  const court = page.getByTestId('court')
  const box = (await court.boundingBox())!
  await court.click({ position: { x: box.width * 0.25, y: box.width * 0.6 } })
  await expect(page.getByTestId('shot-panel')).toBeVisible()
  await page.waitForTimeout(300)
  await shot('10-live-tir')
  await page.getByRole('button', { name: 'Réussi' }).click()
  await expect(page.getByTestId('followup')).toBeVisible()
  await page.waitForTimeout(300)
  await shot('11-live-passe')
  await page.getByRole('button', { name: 'Aucune passe' }).click()
  for (const label of ['Reb. déf.', 'Intercep.', 'Faute']) {
    await page.locator('[data-testid^="oncourt-"]').nth(2).click()
    await page.getByRole('button', { name: label, exact: true }).click()
  }
  await page.getByRole('button', { name: '+2' }).click()
  await page.waitForTimeout(300)
  await shot('12-live-journal')

  expect(errors).toEqual([])
})
