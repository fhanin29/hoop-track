import { expect, test, type Page } from '@playwright/test'

const ROSTER: [number, string, string][] = [
  [4, 'Léa', 'Martin'],
  [7, 'Inès', 'Durand'],
  [9, 'Chloé', 'Petit'],
  [11, 'Manon', 'Roux'],
  [14, 'Sarah', 'Blanc'],
  [15, 'Emma', 'Garnier'],
]

async function addPlayers(page: Page) {
  await page.goto('/#/joueurs?nouveau=1')
  const dialog = page.getByRole('dialog')
  for (const [i, [num, first, last]] of ROSTER.entries()) {
    await dialog.getByLabel('Numéro').fill(String(num))
    await dialog.getByLabel('Prénom').fill(first)
    await dialog.getByLabel('Nom', { exact: true }).fill(last)
    const last_ = i === ROSTER.length - 1
    await dialog.getByRole('button', { name: last_ ? 'Enregistrer' : 'Enregistrer et ajouter', exact: true }).click()
    if (!last_) await expect(page.getByText(`#${num} ${first} ajouté`)).toBeVisible()
  }
  await expect(dialog).toBeHidden()
  for (const [, , last] of ROSTER) await expect(page.getByText(last).first()).toBeVisible()
}

test('saisie d’un match en direct, de la préparation au résumé', async ({ page }) => {
  await addPlayers(page)

  // Création du match
  await page.goto('/#/matchs')
  await page.getByRole('button', { name: 'Nouveau match' }).click()
  await page.getByRole('dialog').getByLabel('Adversaire').fill('BC Lyon')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/#\/matchs\/[^/]+$/)

  // Feuille de match et cinq de départ
  await page.getByRole('button', { name: 'Tout convoquer' }).click()
  for (const [, , last] of ROSTER.slice(0, 5)) {
    const row = page.locator('div.rounded-xl.border', { hasText: last })
    await row.getByRole('button', { name: 'Ajouter au cinq de départ' }).click()
    await expect(row.getByRole('button', { name: 'Retirer du cinq de départ' })).toBeVisible()
  }
  await expect(page.getByText('Cinq de départ (5/5)')).toBeVisible()
  await page.getByRole('button', { name: 'Démarrer le match' }).click()

  // Écran live
  await expect(page.getByTestId('live')).toBeVisible()
  const score = page.getByTestId('score')
  await expect(score).toContainText('0')

  // Joueur puis tir réussi près du panier + passe décisive
  await page.getByTestId('oncourt-4').click()
  const court = page.getByTestId('court')
  const box = (await court.boundingBox())!
  await court.click({ position: { x: box.width / 2, y: box.height * 0.2 } })
  await expect(page.getByTestId('shot-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Réussi' }).click()
  await expect(page.getByTestId('followup')).toBeVisible()
  await page.getByTestId('choice-7').click()
  await expect(page.getByTestId('followup')).toBeHidden()
  await expect(score).toHaveText(/2\D+0/)

  // Action d’abord, joueur ensuite : faute
  await page.getByRole('button', { name: 'Faute', exact: true }).click()
  await page.getByTestId('oncourt-9').click()
  await expect(page.getByTestId('oncourt-9').getByLabel('1 fautes')).toBeVisible()

  // Faute provoquée -> 2 lancers francs (1 réussi, 1 raté) -> pas de rebond offensif
  await page.getByTestId('oncourt-11').click()
  await page.getByRole('button', { name: 'Faute prov.' }).click()
  await page.getByTestId('followup').getByRole('button', { name: '2 LF' }).click()
  await page.getByTestId('followup').getByRole('button', { name: /réussi/i }).click()
  await page.getByTestId('followup').getByRole('button', { name: /raté/i }).click()
  await expect(page.getByTestId('followup')).toContainText('Rebond offensif')
  await page.getByRole('button', { name: 'Rebond adverse / aucun' }).click()
  await expect(score).toHaveText(/3\D+0/)

  // Panier adverse puis annulation
  await page.getByRole('button', { name: '+2' }).click()
  await expect(score).toHaveText(/3\D+2/)
  await page.getByTestId('undo').click()
  await expect(score).toHaveText(/3\D+0/)

  // Journal
  const journal = page.getByTestId('journal')
  await expect(journal).toContainText('Passe décisive')
  await expect(journal).toContainText('Faute')

  // Changement : #14 sort, #15 entre
  await page.getByRole('button', { name: 'Changer' }).click()
  const sub = page.getByRole('dialog')
  await sub.getByText('Blanc').click()
  await sub.getByText('Garnier').click()
  await sub.getByRole('button', { name: /Valider/ }).click()
  await expect(page.getByTestId('oncourt-15')).toBeVisible()
  await expect(page.getByTestId('oncourt-14')).toHaveCount(0)

  await page.screenshot({ path: 'e2e/screenshots/live-test.png' })

  // Fin du match : on passe à la 2e mi-temps (format par défaut) puis on termine
  for (const qt of [2]) {
    await page.getByRole('button', { name: `QT${qt}`, exact: true }).click()
    await page.getByRole('button', { name: `Commencer le QT${qt}` }).click()
    await expect(page.getByTestId('period')).toContainText(String(qt))
  }
  await page.getByRole('button', { name: 'Terminer', exact: true }).click()
  await page.getByRole('button', { name: 'Terminer le match' }).click()

  // Résumé
  await expect(page).toHaveURL(/#\/matchs\/[^/]+$/)
  await expect(page.getByText('Victoire').first()).toBeVisible()
  await expect(page.getByText('Martin').first()).toBeVisible()
})
