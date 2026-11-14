import { expect, test } from '@playwright/test'

const ROSTER: [number, string, string][] = [
  [4, 'Léa', 'Martin'],
  [7, 'Inès', 'Durand'],
  [9, 'Chloé', 'Petit'],
  [11, 'Manon', 'Roux'],
  [14, 'Sarah', 'Blanc'],
  [15, 'Emma', 'Garnier'],
]

test('dictée non reconnue, corrigée à la main puis enregistrée', async ({ page, context }) => {
  // Le modèle vocal ne doit pas être téléchargé pendant les tests : la transcription échoue volontairement
  await context.route(/huggingface\.co|jsdelivr\.net/, (route) => route.abort())

  await page.goto('/#/joueurs?nouveau=1')
  const dialog = page.getByRole('dialog')
  for (const [i, [num, first, last]] of ROSTER.entries()) {
    await dialog.getByLabel('Numéro').fill(String(num))
    await dialog.getByLabel('Prénom').fill(first)
    await dialog.getByLabel('Nom', { exact: true }).fill(last)
    const isLast = i === ROSTER.length - 1
    await dialog.getByRole('button', { name: isLast ? 'Enregistrer' : 'Enregistrer et ajouter', exact: true }).click()
    if (!isLast) await expect(page.getByText(`#${num} ${first} ajouté`)).toBeVisible()
  }
  await expect(dialog).toBeHidden()

  await page.goto('/#/matchs')
  await page.getByRole('button', { name: 'Nouveau match' }).click()
  await page.getByRole('dialog').getByLabel('Adversaire').fill('BC Lyon')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await page.getByRole('button', { name: 'Tout convoquer' }).click()
  for (const [, , last] of ROSTER.slice(0, 5)) {
    await page.locator('div.rounded-xl.border', { hasText: last }).getByRole('button', { name: 'Ajouter au cinq de départ' }).click()
  }
  await expect(page.getByText('Cinq de départ (5/5)')).toBeVisible()
  await page.getByRole('button', { name: 'Démarrer le match' }).click()
  await expect(page.getByTestId('live')).toBeVisible()

  // Le micro n'apparaît qu'une fois la saisie vocale activée
  const mic = page.getByTestId('mic')
  await expect(mic).toBeHidden()
  await page.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('switch', { name: /Saisie vocale/ }).click()
  await page.keyboard.press('Escape')
  await expect(mic).toBeVisible()

  // Appui maintenu : la dictée est enregistrée, puis signalée « à vérifier » faute de transcription
  const box = (await mic.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(900)
  await page.mouse.up()
  await expect(page.getByTestId('mic-errors')).toHaveText('1', { timeout: 30_000 })

  // Correction à la main : la phrase passe par le même parseur que la voix
  await page.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('button', { name: /Dictées/ }).click()
  const clips = page.getByTestId('voice-clips')
  await expect(clips.getByText('À vérifier')).toBeVisible()
  await clips.getByLabel('Phrase dictée').fill('7, trois points réussi, passe du 4')
  await clips.getByRole('button', { name: 'Valider la phrase' }).click()
  await expect(clips.getByText('Enregistrée')).toBeVisible()
  await expect(page.getByTestId('score')).toHaveText(/3\D+0/)
  await expect(page.getByTestId('mic-errors')).toBeHidden()
})
