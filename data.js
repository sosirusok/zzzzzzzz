(() => {
  const JOBS = {
    archer: {
      id: 'archer', name: '아처', color: '#c5342f', damage: 20, cooldown: 0.6,
      rangeTiles: 7, widthTiles: 1, attack: 'pierce', sprite: 'archer', description: '관통 화살 · 1×7'
    },
    medic: {
      id: 'medic', name: '메딕', color: '#36c9a7', damage: 25, cooldown: 1,
      rangeTiles: 5, widthTiles: 1, attack: 'singleStun', stun: 1, sprite: 'medic', description: '주사기 · 1×5 · 1초 스턴'
    },
    chairman: {
      id: 'chairman', name: '체어맨', color: '#079cc1', damage: 25, cooldown: 0.5,
      rangeTiles: 2, widthTiles: 3, attack: 'melee', sprite: 'chairman', description: '의자 휘두르기 · 3×2'
    },
    fireman: {
      id: 'fireman', name: '파이어맨', color: '#f6ce2f', damage: 6, cooldown: 0.2,
      rangeTiles: 3, widthTiles: 3, attack: 'channelStun', stun: 0.28,
      maxFuel: 13.5, recharge: 9, sprite: 'fireman', description: '소화기 분사 · 3×3 · 연속 스턴'
    }
  };

  const ENEMIES = {
    crazy: { name: '광기 좀비', hp: 40, damage: 25, speed: 34, score: 200, radius: 18, sprite: 'crazy' },
    giant: { name: '거대 좀비', hp: 50, secondLife: 50, reviveDelay: 3, damage: 25, speed: 24, score: 500, radius: 28, sprite: 'giant' },
    blind: { name: '눈 없는 좀비', hp: 70, damage: 25, speed: 72, score: 500, radius: 20, sprite: 'blind' },
    athlete: { name: '체육복 좀비', hp: 50, damage: 25, speed: 46, score: 350, radius: 20, sprite: 'athlete', explodeDelay: 3 },
    glutton: { name: '먹보 좀비', hp: 80, damage: 25, speed: 28, score: 600, radius: 24, sprite: 'glutton' },
    chef: { name: '주방장 좀비', hp: 120, damage: 25, speed: 20, score: 900, radius: 24, sprite: 'chef', summon: 'bag', summonEvery: 9 },
    bag: { name: '봉투 좀비', hp: 20, damage: 25, speed: 92, score: 100, radius: 15, sprite: 'bag' },
    girl: { name: '소녀 좀비', hp: 55, damage: 25, speed: 48, score: 400, radius: 17, sprite: 'girl' },
    rabbit: { name: '토끼 좀비', hp: 180, damage: 25, speed: 24, score: 850, radius: 24, sprite: 'rabbit' },
    nurse: { name: '간호사 좀비', hp: 90, damage: 25, speed: 34, score: 700, radius: 20, sprite: 'nurse', summon: 'liquid', summonEvery: 8 },
    liquid: { name: '액체 좀비', hp: 40, damage: 25, speed: 80, score: 0, radius: 16, sprite: 'liquid', explodeDelay: 3 },
    tank: { name: '탱커 좀비', hp: 150, damage: 25, speed: 22, score: 1200, radius: 30, sprite: 'tank' },
    boss: { name: '교장실 보스', hp: 1250, damage: 25, speed: 62, score: 5000, radius: 42, sprite: null, boss: true }
  };

  const STAGES = [
    {
      id: 0, name: '0 STAGE · 출발 구역', theme: 'briefing', objective: '출구에 도달해 작전을 시작하세요.',
      playerStart: [115, 270], exit: [875, 270, 45, 110],
      walls: [[0,0,960,38],[0,502,960,38],[0,0,38,540],[922,0,38,215],[922,325,38,215],[315,105,330,36],[315,399,330,36]],
      waves: []
    },
    {
      id: 1, name: '1 STAGE · 학교 운동장', theme: 'yard', objective: '세 번의 진격을 돌파하고 출구로 이동하세요.',
      playerStart: [80, 270], exit: [895, 215, 40, 110],
      walls: [[0,0,960,28],[0,512,960,28],[0,0,28,540],[932,0,28,205],[932,335,28,205],[250,0,34,170],[250,355,34,185],[480,145,34,250],[720,0,34,175],[720,365,34,175]],
      waves: [
        { triggerX: 170, label: '첫 번째 진격', enemies: [['crazy',350,210],['crazy',350,255],['crazy',395,210],['crazy',395,255],['giant',445,365],['blind',445,120]] },
        { triggerX: 450, label: '두 번째 진격', enemies: [['giant',585,190],['giant',585,245],['giant',635,190],['giant',635,245],['crazy',675,275],['blind',660,390],['blind',690,425],['blind',715,460]] },
        { triggerX: 735, label: '세 번째 진격', enemies: [['giant',810,180],['giant',810,250],['giant',810,320],['blind',865,215],['blind',865,315]] }
      ]
    },
    {
      id: 2, name: '2 STAGE · 카페테리아', theme: 'cafeteria', objective: '제조시설을 파괴한 뒤 출구로 이동하세요.',
      playerStart: [72, 270], exit: [900, 210, 35, 120], facility: [765,225,76,90,600],
      walls: [[0,0,960,28],[0,512,960,28],[0,0,28,540],[932,0,28,205],[932,335,28,205],[210,80,34,350],[430,0,34,180],[430,340,34,200],[655,90,34,360]],
      waves: [
        { triggerX: 150, label: '첫 번째 진격', enemies: [['athlete',300,190],['athlete',300,270],['athlete',300,350],['glutton',385,120]] },
        { triggerX: 380, label: '두 번째 진격', enemies: [['chef',535,180],['chef',535,335],['glutton',590,220],['glutton',590,300]] },
        { triggerX: 615, label: '세 번째 진격', enemies: [['glutton',730,125],['glutton',775,125],['glutton',820,125],['glutton',865,125]] },
        { triggerX: 735, label: '마지막 진격', enemies: [['athlete',820,390],['athlete',860,425],['chef',790,455],['chef',865,360],['glutton',740,420]] }
      ]
    },
    {
      id: 3, name: '3 STAGE · 교실동', theme: 'classroom', objective: '교장실 열쇠를 찾아 출구를 여세요.',
      playerStart: [72,455], exit: [895,44,40,105], keysRequired: 1,
      keySpots: [[180,105],[385,110],[595,100],[805,105],[180,405],[450,405],[720,405]],
      walls: [[0,0,960,28],[0,512,960,28],[0,0,28,540],[932,0,28,32],[932,160,28,380],[255,28,28,170],[255,300,28,212],[500,28,28,210],[500,340,28,172],[745,28,28,170],[745,300,28,212],[28,255,160,28],[300,255,135,28],[565,255,145,28],[820,255,112,28]],
      waves: [
        { triggerX: 145, label: '첫 번째 진격', enemies: [['girl',220,430],['girl',250,460],['rabbit',325,430]] },
        { triggerX: 390, label: '교실 진격', enemies: [['girl',415,180],['girl',455,180],['nurse',470,115]] },
        { triggerX: 650, label: '복도 진격', enemies: [['girl',635,385],['girl',680,420],['rabbit',700,355],['nurse',675,110]] }
      ]
    },
    {
      id: 4, name: '4 STAGE · 교장실', theme: 'office', objective: '3분 5초 안에 보스를 쓰러뜨리세요.',
      playerStart: [480,465], bossTime: 185,
      walls: [[0,0,960,28],[0,512,960,28],[0,0,28,540],[932,0,28,540],[310,28,28,155],[622,28,28,155],[310,330,28,182],[622,330,28,182],[338,190,110,28],[512,190,110,28]],
      waves: [{ triggerX: 0, label: 'BOSS', enemies: [['boss',480,110],['tank',180,105],['liquid',780,105]] }],
      reinforcements: { every: 13, entries: [['tank',165,95],['liquid',795,95]] }
    }
  ];

  const VERIFIED = {
    jobs: ['damage','rangeTiles','widthTiles','cooldown','attack'],
    enemies: ['crazy.hp','crazy.damage','giant.hp','giant.secondLife','giant.damage','blind.hp','blind.damage','glutton.hp','boss.hp'],
    note: '그 밖의 적 수치·정확한 타일 좌표는 제공 자료만으로 확정되지 않아 플레이 가능한 근사값이다.'
  };

  window.EP1_DATA = { JOBS, ENEMIES, STAGES, VERIFIED, TILE: 34 };
})();
