(() => {
  "use strict";

  const TILE = 32;
  const TICK_RATE = 20;
  const PLAYER_SPEED = 192;

  const JOBS = Object.freeze({
    archer: {
      id: "archer",
      name: "아처",
      skill: "화살 발사",
      color: "#c82f2f",
      damage: 20,
      cooldown: 0.6,
      range: [1, 7],
      attack: "pierce",
      description: "관통하는 화살 · 1×7칸",
    },
    medic: {
      id: "medic",
      name: "메딕",
      skill: "주사기 투척",
      color: "#35c9a4",
      damage: 25,
      cooldown: 1,
      stun: 1,
      range: [1, 5],
      attack: "first-hit",
      healSeconds: 3,
      description: "첫 대상 적중 · 1×5칸 · 1초 스턴",
    },
    chairman: {
      id: "chairman",
      name: "체어맨",
      skill: "의자 휘두르기",
      color: "#079cc1",
      damage: 25,
      cooldown: 0.5,
      range: [3, 2],
      attack: "area",
      description: "근거리 범위 · 3×2칸",
    },
    fireman: {
      id: "fireman",
      name: "파이어맨",
      skill: "소화기 분사",
      color: "#f2c528",
      damage: 6,
      cooldown: 0.2,
      range: [3, 3],
      attack: "channel",
      maxFuel: 13.5,
      rechargeSeconds: 9,
      description: "이동 불가 연속 분사 · 3×3칸",
    },
  });

  const ENEMIES = Object.freeze({
    crazy: { name: "광기 좀비", hp: 40, score: 200, speed: 80, vision: 6, sprite: "crazy" },
    giant: { name: "거대 좀비", hp: 50, secondLife: 50, score: 500, speed: 56, vision: 7, sprite: "giant", revive: true },
    blind: { name: "눈 없는 좀비", hp: 70, score: 500, speed: 112, vision: 4, sprite: "blind" },
    athlete: { name: "체육복 좀비", hp: 50, score: 500, speed: 80, vision: 4, sprite: "athlete", explode: true },
    chef: { name: "주방장 좀비", hp: 120, score: 900, speed: 48, vision: 7, sprite: "chef", summon: "bag" },
    bag: { name: "봉투 좀비", hp: 20, score: 100, speed: 128, vision: 7, sprite: "bag" },
    glutton: { name: "먹보 좀비", hp: 80, score: 600, speed: 64, vision: 7, sprite: "glutton" },
    girl: { name: "소녀 좀비", hp: 70, score: 600, speed: 112, vision: 7, sprite: "girl" },
    rabbit: { name: "토끼 좀비", hp: 100, secondLife: 100, score: 800, speed: 80, vision: 7, sprite: "rabbit", revive: true },
    nurse: { name: "간호사 좀비", hp: 140, score: 900, speed: 80, vision: 8, sprite: "nurse", summon: "liquid" },
    liquid: { name: "액체 좀비", hp: 30, score: 200, speed: 96, vision: 12, sprite: "liquid", explode: true },
    tank: { name: "탱커 좀비", hp: 150, score: 0, speed: 56, vision: 30, sprite: "tank" },
    boss: { name: "교장 선생님", hp: 1250, score: 5000, speed: 160, vision: 30, sprite: "boss", boss: true },
  });

  const boundary = (width, height) => [
    [0, 0, width, 28],
    [0, height - 28, width, 28],
    [0, 0, 28, height],
    [width - 28, 0, 28, height],
  ];

  const seams = (count, roomWidth = 370, height = 360) => {
    const result = [];
    for (let index = 1; index < count; index += 1) {
      const x = index * roomWidth - 8;
      result.push([x, 28, 16, 98], [x, height - 126, 16, 98]);
    }
    return result;
  };

  const STAGES = Object.freeze([
    {
      id: 0,
      title: "학교 본관",
      image: "assets/runtime/maps/stage0.png",
      width: 640,
      height: 360,
      start: [320, 316],
      time: 145,
      objective: "정동석 일행의 이야기를 듣고 오른쪽 출구로 이동하세요.",
      solids: [
        ...boundary(640, 360),
        [46, 108, 140, 136], [454, 108, 140, 136], [0, 244, 235, 34], [405, 244, 235, 34],
      ],
      npcs: [
        { name: "곽준형", x: 208, y: 92 },
        { name: "고나래", x: 417, y: 92 },
        { name: "정동석", x: 320, y: 175 },
      ],
      exit: [584, 140, 40, 80],
    },
    {
      id: 1,
      title: "학교 운동장",
      image: "assets/runtime/maps/stage1.png",
      width: 1850,
      height: 360,
      start: [60, 180],
      time: 178,
      objective: "운동장을 지나 카페테리아 입구에 도착하세요.",
      solids: [...boundary(1850, 360), ...seams(5)],
      fixedEnemies: [["giant", 520, 108], ["blind", 585, 258]],
      areas: [
        { at: [150, 90, 190, 180], enemies: [["crazy", 4]] },
        { at: [790, 80, 220, 210], enemies: [["giant", 4], ["crazy", 1]] },
        { at: [1390, 70, 210, 220], enemies: [["giant", 3], ["blind", 2]] },
      ],
      exit: [1790, 118, 42, 124],
    },
    {
      id: 2,
      title: "카페테리아",
      image: "assets/runtime/maps/stage2.png",
      width: 2220,
      height: 360,
      start: [60, 180],
      time: 198,
      objective: "제조 시설을 파괴한 뒤 출구로 이동하세요.",
      solids: [...boundary(2220, 360), ...seams(6)],
      fixedEnemies: [["athlete", 210, 118], ["glutton", 310, 255]],
      areas: [
        { at: [410, 80, 230, 210], enemies: [["athlete", 3]] },
        { at: [790, 70, 240, 220], enemies: [["chef", 2], ["glutton", 2]] },
        { at: [1160, 150, 250, 170], enemies: [["glutton", 4]] },
        { at: [1580, 70, 230, 230], enemies: [["chef", 2], ["athlete", 2], ["glutton", 2]] },
      ],
      facility: { x: 2025, y: 178, hp: 200 },
      exit: [2160, 118, 42, 124],
    },
    {
      id: 3,
      title: "교실",
      image: "assets/runtime/maps/stage3.png",
      width: 1480,
      height: 660,
      start: [60, 584],
      time: 225,
      objective: "일곱 후보 중 한 곳에 숨겨진 교장실 열쇠를 찾으세요.",
      solids: [
        ...boundary(1480, 660),
        ...seams(4, 370, 660),
        [0, 300, 170, 20], [230, 300, 280, 20], [570, 300, 280, 20], [910, 300, 280, 20], [1250, 300, 230, 20],
      ],
      keySpots: [[160, 110], [520, 130], [880, 120], [1270, 105], [180, 520], [730, 500], [1250, 515]],
      fixedEnemies: [["girl", 255, 548], ["rabbit", 465, 465], ["nurse", 1020, 145]],
      areas: [
        { at: [110, 430, 190, 190], enemies: [["girl", 2], ["rabbit", 1]] },
        { at: [390, 40, 250, 220], enemies: [["girl", 6]] },
        { at: [770, 350, 240, 240], enemies: [["rabbit", 3]] },
        { at: [1160, 40, 240, 220], enemies: [["girl", 2], ["nurse", 1]] },
        { at: [1140, 360, 250, 230], enemies: [["girl", 2], ["liquid", 2]] },
      ],
      exit: [1415, 50, 42, 105],
    },
    {
      id: 4,
      title: "교장실",
      image: "assets/runtime/maps/stage4.png",
      width: 640,
      height: 360,
      start: [320, 318],
      time: 185,
      objective: "교장 선생님을 쓰러뜨리세요.",
      solids: [...boundary(640, 360), [250, 112, 142, 164], [150, 92, 22, 198], [466, 92, 22, 198]],
      boss: { x: 320, y: 72 },
      adds: [["tank", 125, 94], ["liquid", 515, 96]],
    },
  ]);

  window.EP1_DATA = { TILE, TICK_RATE, PLAYER_SPEED, JOBS, ENEMIES, STAGES };
})();
