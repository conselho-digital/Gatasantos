import { iniciarJogo } from './game/jogo';
import { achar, EQUIPES } from './game/characters';
import { mostrarMenu } from './ui/menu';

const params = new URLSearchParams(location.search);

// ?menu=0 (só no dev) pula o menu e entra direto, para testes.
if (import.meta.env.DEV && params.get('menu') === '0') {
  iniciarJogo({ nome: 'Dev', personagem: achar(params.get('char') ?? '').id, equipe: EQUIPES[0], mapa: 'cidade', travarMouse: false }, params);
} else {
  mostrarMenu().then((cfg) => iniciarJogo(cfg, params));
}
