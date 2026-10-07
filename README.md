# LEFT 4 MIAMI 2 // RETRO BLOODLINE

Survival de zumbis top-down (Three.js r128) com estética synthwave. Abra `index.html` no navegador.

## Estrutura
- `index.html` – HUD, menus e modais
- `style.css` – estilos (inclui barra de slots, seed e prompt de interação)
- `game.js` – motor completo (áudio, mapa procedural, player, zumbis, combate)

## Controles
| Tecla | Ação |
|---|---|
| WASD / mouse | Mover / mirar |
| Clique esquerdo | Atirar, golpear, arremessar granada ou usar kit (conforme o slot) |
| Clique direito | Empurrão |
| 1 / 2 / 3 / 4 / 5 | Arma longa / Pistola / Machado / Granadas / Kit médico |
| 4 de novo | Alterna o tipo de granada (G, T, F) |
| G / T / F | Arremessa direto a granada G, T ou F |
| E | Pega/troca arma do chão (a antiga fica no chão) |
| R | Recarrega (ou reinicia a fase ao morrer) |
| V | Usa kit médico |
| Q | Arremessa a arma da mão |
| ESC / P | Pausa |

## Mapas procedurais e seed
- Digite uma seed no menu inicial (ou deixe vazio para sortear). Mesma seed + mesma fase = mesmo mapa.
- A seed aparece no HUD e no menu de pausa (botão "Copiar Seed").
- A **zona central** (armas, munição, granadas, kits) é sempre idêntica; os itens de lá reaparecem.
- Garantias de jogabilidade (ver `MapGen` em `game.js`): cada estrutura só é aceita se **todas** as áreas livres continuarem conectadas ao centro; espaçamento mínimo entre estruturas; nada fora dos limites, sobreposto ou dentro de paredes; `validate()` reconfere tudo e regenera de forma determinística se falhar.

## Como estender
- **Nova arma:** adicione em `WEAPONS` (slot, munição, dano...) e um `model` em `buildWeaponModel()` + um ícone em `ICONS`.
- **Nova munição:** adicione em `AMMO` e use o id em `ammo:` da arma. Para reabastecer no centro, inclua em `CENTER_LAYOUT.ammo`.
- **Nova granada (ex.: variações de F):** adicione em `GRENADES` com `fuse`, `lure` e os ganchos `onLand` / `onTick` / `onEnd`; inclua o id em `GRENADE_ORDER`.