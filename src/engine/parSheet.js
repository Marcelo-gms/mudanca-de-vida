/**
 * Matriz de Configuração do Modelo PAR
 * Conforme ARCHITECTURE.md Seção 2.1
 */
const SYMBOLS = {
  TIGRE: {
    id: 'TIGRE',
    name: 'Tigre Dourado',
    peso: 2,
    mult: 50,
    isWild: true,
    color: '#FFD700',
    icon: '🐯'
  },
  MOEDA: {
    id: 'MOEDA',
    name: 'Pote de Moedas',
    peso: 8,
    mult: 10,
    isWild: false,
    color: '#FFA500',
    icon: '💰'
  },
  BARRA: {
    id: 'BARRA',
    name: 'Barra de Ouro',
    peso: 20,
    mult: 5,
    isWild: false,
    color: '#32CD32',
    icon: '🧧'
  },
  LARANJA: {
    id: 'LARANJA',
    name: 'Laranja da Sorte',
    peso: 70,
    mult: 2,
    isWild: false,
    color: '#FF4500',
    icon: '🍊'
  }
};

const ROLO_CONFIG = [
  SYMBOLS.TIGRE,
  SYMBOLS.MOEDA,
  SYMBOLS.BARRA,
  SYMBOLS.LARANJA
];

const TOTAL_WEIGHT = ROLO_CONFIG.reduce((acc, curr) => acc + curr.peso, 0); // 100

// 5 Linhas de Pagamento padrão (para grade 3x3)
// Formato: [ [linha, coluna], [linha, coluna], [linha, coluna] ]
const PAYLINES_3X3 = [
  { id: 1, name: 'Linha Central', coords: [[1, 0], [1, 1], [1, 2]] },
  { id: 2, name: 'Linha Superior', coords: [[0, 0], [0, 1], [0, 2]] },
  { id: 3, name: 'Linha Inferior', coords: [[2, 0], [2, 1], [2, 2]] },
  { id: 4, name: 'Diagonal Descendente', coords: [[0, 0], [1, 1], [2, 2]] },
  { id: 5, name: 'Diagonal Ascendente', coords: [[2, 0], [1, 1], [0, 2]] }
];

module.exports = {
  SYMBOLS,
  ROLO_CONFIG,
  TOTAL_WEIGHT,
  PAYLINES_3X3
};

