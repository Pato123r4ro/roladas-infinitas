# 🎲 Roladas Infinitas - Sistema de Rolagem de RPG Customizável

**Roladas Infinitas** é um aplicativo web moderno, responsivo e 100% autônomo (não necessita de internet nem servidores) desenvolvido para jogadores e mestres de RPG de mesa (TTRPG).

---

## 📁 Estrutura do Projeto

```text
roladas-infinitas/
├── index.html       # Estrutura visual semântica, abas, arena, seletores 3D e modais
├── style.css        # Sistema de temas visuais, layout responsivo e arena 3D
├── app.js           # Mecanismo de rolagens, engine 3D poliédrico, som Web Audio e storage
├── README.md        # Documentação e guia de sintaxe para futuras atualizações
└── models/          # Modelos 3D originais OBJ importados do Blender (d4, d6, d8, d10, d100, d12, d20)
```

---

## 🚀 Como Executar

Basta abrir o arquivo `index.html` em qualquer navegador moderno (Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, Safari, Opera).

- Não requer `npm`, Node.js, Python ou servidor local.
- Funciona 100% offline.
- Todos os dados (botões personalizados, tabelas, histórico e configurações) são salvos no `localStorage` do seu navegador.

---

## ✨ Funcionalidades

### 1. 🎲 Mesa de Rolagem (Dice Tray) com Modelos 3D Chanfrados de Estúdio
- **Malhas 3D Poliédricas Chanfradas (Beveled Sub-Mesh Compiler)**:
  - Modelos poliédricos importados e compilados com chanfros reais a partir dos arquivos `.obj` do Blender (`SpaceD4.obj`, `SpaceD6 (1).obj`, `SpaceD10.obj`, `SpaceD100.obj`, `SpaceD12.obj`, `SpaceD20.obj`, além do `d8`).
  - Cada dado possui **Faces Principais** com cavidade interna rebaixada (*Inner Recessed Well*), **Chanfros de Aresta 3D a 45°** (*Edge Bevels*) e **Facetas de Vértice 3D** (*Corner Bevels*), formando sólidos estritamente convexos de alta precisão (ex: 26 facetas no `d6` e `d8`, 42 no `d10`/`d100`, 62 no `d12` e `d20`, 14 no `d4`).
- **Dado D6 com Modo Duplo (Pips 3D Côncavos `⚅` & Números RPG `🔢`)**:
  - Por padrão, o `d6` exibe **Pips 3D Esféricos Côncavos** entalhados em cada face (com ornamento especial no Ás `1`), além de permitir alternar com 1 clique para **Números RPG Entalhados** (`1` a `6`).
- **Projeção em Perspectiva 3D Real e Mapeamento Tangente Jacobiano**:
  - Perspectiva autêntica (`depth = camDist - rz`) combinada com *Perspective Backface Culling* exato (`dot(N, Cam - FaceCenter) > 0`), eliminando qualquer inversão óptica ou *flickering* nas bordas.
  - Algarismos, pips e entalhes projetados diretamente no plano tangente 3D `(T, B, N)` de cada face via matriz afim Jacobiana, inclinando e escorçando junto com o giro do dado em tempo real.
  - Iluminação Studio de 3 Pontos (*Key Light*, *Fill Light* e *Fresnel Rim Light*) em resolução *High-DPI / Retina*.
- **Interatividade Total**:
  - O jogador pode clicar e arrastar os dados com o mouse ou toque para girá-los livremente em qualquer ângulo 3D.
  - Clicar diretamente no palco 3D dispara a rolagem instantânea da fórmula atual.
  - Chips seletores permitem alternar a visualização e rotação rápida entre `d4`, `d6`, `d8`, `d10`, `d12`, `d20` e `d100 (2x d10)`.
- **Sincronização de Temas e Críticos**:
  - As cores, reflexos e arestas dos dados adaptam-se em tempo real ao tema visual selecionado (Mago Arcano, Masmorra, Pergaminho, Cyberpunk, Floresta).
  - Em um Nat 20 ou Nat 1, o dado 3D emite feixes de faíscas dinâmicas coloridas no momento do pouso.
- **Seleção Poliédrica Rápida**: Clique com o botão esquerdo para adicionar dados (`d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100 (2x d10)`) à parada.
- **Botão Direito**: Subtrai dados da parada atual.
- **Modificadores (+/-)**: Bônus e penalidades numéricas diretos.
- **Atalhos de Vantagem / Desvantagem**:
  - ⭐ **Vantagem**: Rola 2 dados de 20 e mantém o maior (`2d20kh1`).
  - 🔻 **Desvantagem**: Rola 2 dados de 20 e mantém o menor (`2d20kl1`).
- **Arena de Rolagem Visual**:
  - Destaque em tamanho grande para o resultado final.
  - Fichas animadas (*dice tokens*) com cada face rolada e indicação dos dados descartados ou críticos.
- **Efeitos Especiais de Crítico**:
  - ✨ **Nat 20 (Sucesso Crítico)**: Brilho esmeralda/dourado, arpeggio musical sintetizado e chuva de confetes no canvas!
  - 💀 **Nat 1 (Falha Crítica)**: Brilho rubro carmesim e efeito sonoro dramático.

---

### 2. ⚔️ Botões & Macros Customizáveis
- **Pré-configurados**:
  - *D&D 5e / Tormenta 20*: Ataque com Arma (`1d20+5`), Ataque com Vantagem (`2d20kh1+5`), Dano Espada Longa (`1d8+3`), Bola de Fogo (`8d6`), Rolar Atributo (`4d6dl1`).
  - *Call of Cthulhu 7e*: Sanidade / Perícias (`1d100`).
  - *Ordem Paranormal*: Teste com 3 Dados (`3d20kh1`).
  - *Vampiro: A Máscara*: Parada de Sucessos (`6d10>=6`).
  - *FATE Core*: 4 Dados FATE + Perícia (`4dF + 2`).
- **Criar, Editar e Excluir**: Personalize nome, emoji, fórmula, categoria e notas adicionais.
- **Pesquisa e Filtros por Categoria**: Encontre rapidamente qualquer magia, ataque ou habilidade.

---

### 3. 📜 Tabelas Aleatórias (Roll Tables)
- Sorteios com fórmulas de dados flexíveis (`1d6`, `1d8`, `1d20`, `1d100`).
- Suporta intervalos numéricos (`1`, `2-3`, `4-5`, etc.).
- Acompanha tabelas prontas de Críticos Épicos, Encontros de Masmorra e Saque de Monstros.

---

### 4. 📊 Histórico & Estatísticas
- Registro das últimas 50 rolagens com horário, fórmula, valores individuais e total.
- Clique em qualquer item do histórico para **rolar novamente**.
- Botão para **copiar todo o histórico formatado** para o Discord, WhatsApp ou ficha de personagem.
- Painel de estatísticas em tempo real: total de rolagens, média geral, maior resultado e quantidade de 20s naturais.

---

### 5. 🔊 Efeitos Sonoros 100% Sintetizados
- Áudio sintetizado em tempo real usando a **Web Audio API** nativa (ruído filtrado com *bandpass* para simular dados rolando na madeira/feltro, osciladores musicais para acertos e falhas críticas).
- Sem necessidade de arquivos de áudio externos (`.mp3` ou `.wav`).

---

### 6. 🎨 5 Temas Visuais Imersivos
1. 🔮 **Mago Arcano** (Roxo Místico & Ciano)
2. ⚔️ **Masmorra Clássica** (Slate Escuro, Ouro & Carmesim)
3. 📜 **Pergaminho Antigo** (Sépia e Couro Envelhecido)
4. 🌌 **Cyberpunk Neon** (Obsidiana & Rosa Neon)
5. 🌲 **Floresta Élfica** (Esmeralda & Dourado da Natureza)

---

### 7. 💾 Backup & Compartilhamento (JSON)
- Exporte e importe suas rolagens, tabelas e configurações em formato JSON com apenas um clique.
- Botão de restauração rápida para os padrões de fábrica.

---

## 📖 Sintaxe das Fórmulas Suportadas

| Sintaxe | Descrição | Exemplo |
| :--- | :--- | :--- |
| `XdY` | Rola X dados de Y faces | `3d6`, `1d20`, `1d100` |
| `khN` | Mantém os N maiores dados (*Keep Highest*) | `2d20kh1` (Vantagem no D&D) |
| `klN` | Mantém os N menores dados (*Keep Lowest*) | `2d20kl1` (Desvantagem no D&D) |
| `dlN` | Descarta os N menores dados (*Drop Lowest*) | `4d6dl1` (Atributos de D&D) |
| `dhN` | Descarta os N maiores dados (*Drop Highest*) | `4d6dh1` |
| `!` | Dado Explosivo (rola de novo se tirar valor máximo) | `3d6!` |
| `>=N` ou `>N` | Contagem de sucessos (Storyteller / WoD) | `6d10>=6` |
| `dF` | Dados FATE / Fudge (-1, 0, +1) | `4dF + 2` |
| `+`, `-`, `*`, `/` | Operações matemáticas e bônus | `1d20 + 7`, `2d6 * 2` |
| `# Motivo` | Adiciona um rótulo/etiqueta na rolagem | `1d20 + 5 # Ataque Adaga` |

---

## 🛠️ Guia para Futuras Atualizações

Ao desenvolver novas funcionalidades para o **Roladas Infinitas**:
1. **Adicionar novos tipos de dados ou regras**: Estenda a classe `DiceEngine` em `app.js`. O método `evaluate` analisa os tokens via expressões regulares e calcula o resultado.
2. **Novos Temas**: Adicione classes de tema em `style.css` (ex: `body.theme-nome {...}`) e inclua as opções correspondentes no `<select id="theme-select">` em `index.html`.
3. **Novos Sons / Músicas**: Use a classe `SoundFX` em `app.js` aproveitando a Web Audio API para manter o aplicativo livre de dependências externas.
4. **Novas Abas ou Ferramentas**: Adicione um botão em `.nav-tabs` com o atributo `data-tab="seu-id"` e uma `<section id="tab-seu-id" class="tab-pane">` correspondente no `index.html`.
