# FlapCast 01 – Tabelă split-flap pentru evenimente

Tabelă mecanică de aeroport (stil Solari) care rulează în browser: afișează mesaje, redă un
**playbook** de eveniment cu semnale sonore și voce, și exportă video pentru ecrane mari.

**Pornire:** deschide `index.html` în Chrome sau Edge. Merge și fără internet (fonturile și stilurile sunt locale).
Pe GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Scenariul (playbook)

| Scrii în text        | Ce face                                                     |
|----------------------|-------------------------------------------------------------|
| rând gol             | pagină nouă (frazele lungi se împart singure)               |
| `*** sunet`          | clopoțel de aeroport                                        |
| `*** sunet avion`    | sunetul propriu încărcat cu numele „avion”                  |
| `[8s]` în paragraf   | paginile paragrafului stau 8 secunde                        |
| `[pauză 3]`          | tabelă goală 3 secunde                                      |

## Pentru eveniment

- **Ecran mare** (tasta `F`): doar tabela, pe tot ecranul.
- **Proiector**: deschide o fereastră separată doar cu tabela – mut-o pe proiector și dă click în ea.
  Controlul rămâne în fereastra principală (Spațiu / ← → merg și din fereastra proiectorului).
- **Video**: Playbook → *Înregistrează video* (Full HD sau 4K, cu sunet). Ține fila deschisă în prim-plan.
- **Salvează proiect**: text + setări + sunete într-un singur fișier `.flapcast.json`, pentru alt calculator.

## Structură

```
index.html      pagina aplicației (telefon + laptop)
js/board.js     tabela + sintetizatorul audio
js/app.js       setări, teme, controale, ecran mare, proiector
js/playbook.js  playbook, voce, sunete, proiecte
js/video.js     export video 1080p / 4K
css/, fonts/    stiluri și fonturi locale
tools/          build pentru css/app.css (tools/build-css.cmd, necesită Node.js)
```
