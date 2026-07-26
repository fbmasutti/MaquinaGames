// Geometria do tabuleiro, cores e parâmetros de física — Toca o Sino.
// Coordenadas em pixels de canvas. Origem no canto superior esquerdo.

const WALL = 14;
const LANE_WIDTH = 54; // largura do canal do lançador, na direita

// Campo principal (sem o canal do lançador)
const FIELD_LEFT = WALL;
const FIELD_RIGHT_OUTER = 480 - WALL; // parede externa direita, atrás do canal
const FIELD_RIGHT = FIELD_RIGHT_OUTER - LANE_WIDTH; // parede que separa o canal do campo
const FIELD_WIDTH = FIELD_RIGHT - FIELD_LEFT;
const FIELD_CENTER_X = FIELD_LEFT + FIELD_WIDTH / 2;
const DOME_RADIUS = FIELD_WIDTH / 2;
const DOME_BASE_Y = WALL + DOME_RADIUS; // onde a cúpula termina e as paredes retas começam

// Geometria dos flippers, calculada antes pra poder derivar as guias/slings.
const FLIPPER_PIVOT_Y = 720 - 96;
const FLIPPER_LENGTH = 78;
const FLIPPER_GAP = 95; // meia-distância do centro do campo até cada pivô — pivôs perto das paredes, como na referência
const FLIPPER_PIVOT_L = { x: FIELD_CENTER_X - FLIPPER_GAP, y: FLIPPER_PIVOT_Y };
const FLIPPER_PIVOT_R = { x: FIELD_CENTER_X + FLIPPER_GAP, y: FLIPPER_PIVOT_Y };

const BOARD = {
  width: 480,
  height: 720,
  wall: WALL,
  laneWidth: LANE_WIDTH,
  fieldLeft: FIELD_LEFT,
  fieldRight: FIELD_RIGHT,
  fieldRightOuter: FIELD_RIGHT_OUTER,
  fieldCenterX: FIELD_CENTER_X,
  domeRadius: DOME_RADIUS,
  domeBaseY: DOME_BASE_Y,
  domeTopY: WALL,

  // Rampa que fecha o canto entre o canal do lançador e a cúpula. Sem ela, o
  // canal é um tubo isolado até o topo do quadro: a bola lançada sobe reto e
  // cai reto de volta pro canal, sem nunca entrar no campo — o vão abaixo da
  // cúpula (nas paredes, logo abaixo) fica logo ao lado, mas nada guia a
  // bola até ele. Essa rampa liga o topo do canal (fieldRightOuter) até onde
  // a cúpula termina (fieldRight, domeBaseY), bem em cima desse vão.
  laneCap: { x1: FIELD_RIGHT_OUTER, y1: DOME_BASE_Y + 24, x2: FIELD_RIGHT, y2: DOME_BASE_Y },

  ballRadius: 11,

  // Sino — alvo principal, perto do topo da cúpula.
  bell: { x: FIELD_CENTER_X, y: WALL + 46, r: 24 },

  // Rampa em forquilha logo abaixo do sino: um "telhado" que recebe a bola
  // vinda de qualquer um dos lados, guia até o sino, e depois de tocar,
  // a própria inclinação devolve a bola pro campo por um dos lados.
  ramp: {
    peakX: FIELD_CENTER_X,
    peakY: WALL + 46 + 24 + 30,
    halfSpan: 58,
    drop: 34,
  },

  // Pinos/bumpers no meio do campo.
  bumpers: [
    { x: FIELD_CENTER_X - 62, y: DOME_BASE_Y + 130, r: 16 },
    { x: FIELD_CENTER_X + 62, y: DOME_BASE_Y + 130, r: 16 },
    { x: FIELD_CENTER_X, y: DOME_BASE_Y + 210, r: 16 },
  ],

  // Flippers
  flipperPivotY: FLIPPER_PIVOT_Y,
  flipperLength: FLIPPER_LENGTH,
  flipperThickness: 16,
  flipperGap: FLIPPER_GAP,
  // Ângulos do flipper ESQUERDO (o direito é espelhado como π - ângulo).
  // Convenção: 0 = apontando pra direita, π/2 = apontando pra baixo,
  // aumentando no sentido horário. Em repouso a ponta aponta pra baixo e
  // pro lado de fora (~152°); acionado, gira pra CIMA e pro lado de dentro
  // (~-23°) — é isso que lança a bola pro campo. Os pivôs ficam afastados
  // o bastante do centro (flipperGap) pra que as pontas não se cruzem
  // quando os dois flippers estão acionados ao mesmo tempo.
  flipperRestAngle: 2.65,
  flipperActiveAngle: -0.4,
  flipperAngularSpeed: 0.045, // rad por passo de física a ~60fps

  // Guias/slingshots: ligam a parede externa ao pivô de cada flipper, pra
  // bola descer acompanhando a borda em vez de cair reto pelo vão entre a
  // parede e o flipper (que ficava fora do alcance dele).
  slingshots: [
    { x1: FIELD_LEFT, y1: FLIPPER_PIVOT_Y - 100, x2: FLIPPER_PIVOT_L.x - 6, y2: FLIPPER_PIVOT_Y - 4 },
    { x1: FIELD_RIGHT, y1: FLIPPER_PIVOT_Y - 100, x2: FLIPPER_PIVOT_R.x + 6, y2: FLIPPER_PIVOT_Y - 4 },
  ],

  // Canal do lançador (direita)
  launcherX: FIELD_RIGHT + LANE_WIDTH / 2,
  launcherRestY: 720 - 60,
  launcherMinLaunchSpeed: 6,
  // Acima de ~23 a bola pode ficar presa no canto entre a rampa do canal e a
  // parede externa (as duas normais se equilibram exatamente contra a
  // gravidade ali, travando a bola de vez). 22 fica com boa folga disso.
  launcherMaxLaunchSpeed: 22,
  launcherChargeRate: 1.6, // por segundo, 0→1

  ballsPerGame: 3,
};

const PHYSICS = {
  gravity: 1,
  frictionAir: 0.0022,
  restitution: 0.42,
  ballFriction: 0.02,
  ballDensity: 0.02,
  bumperRestitution: 0.9,
  wallRestitution: 0.35,
  slingshotRestitution: 0.7,
  settleSpeedForFlipperHit: 0.02,
};

const COLORS = {
  field: '#bfe3d6',
  fieldDark: '#a9d2c3',
  rail: '#1f3f8f',
  railDark: '#14265c',
  woodLight: '#e7c99a',
  woodMid: '#c9a469',
  woodDark: '#8a6a3a',
  cream: '#f0e6d2',
  creamDark: '#e2d3b0',
  navy: '#2d3652',
  brass: '#d4af37',
  brassDark: '#9c7a1f',
  yellow: '#e8b923',
  red: '#c0392b',
};
