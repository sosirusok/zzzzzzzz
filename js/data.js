/* =========================================================================
 *  PROJECT HUNTERS — 클래식 브루드워 스타일 팬 메이드 RTS
 *  data.js — 전 유닛/건물/업그레이드/기술 데이터 (Brood War 1.16 수치 기준)
 *  수치 출처: Liquipedia StarCraft Wiki (공개 게임 데이터)
 *  모든 그래픽/사운드는 오리지널 프로시저럴 아트 (블리자드 에셋 미사용)
 * ========================================================================= */
'use strict';
window.SC = window.SC || {};

(function () {
  const D = {};

  // ---- 상수 ---------------------------------------------------------------
  D.TICKS = 24;                 // 초당 로직 틱 (Fastest ≈ 23.81fps ≈ 24)
  D.TILE = 32;                  // 타일 픽셀
  D.SUPPLY_CAP = 400;           // 내부 하프서플라이 (표시 200)
  D.START_MINERALS = 50;
  D.START_WORKERS = 4;
  D.MINERAL_PER_TRIP = 8;
  D.GAS_PER_TRIP = 8;
  D.GAS_DEPLETED = 2;
  D.PATCH_AMOUNT = 1500;
  D.GEYSER_AMOUNT = 5000;
  D.MINE_TIME = 80;             // 채취 소요 틱 (Liquipedia: 80프레임)
  D.GAS_TIME = 37;
  D.ENERGY_START = 50;
  D.ENERGY_MAX = 200;
  D.ENERGY_REGEN = 8;           // <<8 고정소수: 초당 약 0.75
  D.ZERG_REGEN = 4;             // hp<<8 per tick ≈ 0.38/s
  D.SHIELD_REGEN = 7;           // ≈ 0.65/s
  D.BURN_THRESHOLD = 3;         // 테란 건물 1/3 이하 화재
  D.MIN_DAMAGE = 128;           // 최소 피해 0.5 (<<8)

  // 크기: 0=소형 1=중형 2=대형 / 피해타입 배율 [소, 중, 대]
  D.SIZE_NAME = ['소형', '중형', '대형'];
  D.MULT = {
    n: [256, 256, 256],          // 일반
    e: [128, 192, 256],          // 폭발형 50/75/100
    c: [256, 128, 64],           // 진동형 100/50/25
  };
  D.TYPE_NAME = { n: '일반형', e: '폭발형', c: '진동형' };

  D.RACES = {
    T: { name: '테란',   color: '#3a86ff', worker: 'scv',   hall: 'command_center', supplyName: '보급품', gasName: '정제소', gasB: 'refinery' },
    Z: { name: '저그',   color: '#9d4edd', worker: 'drone', hall: 'hatchery',       supplyName: '컨트롤', gasName: '추출장', gasB: 'extractor' },
    P: { name: '프로토스', color: '#ffd60a', worker: 'probe', hall: 'nexus',         supplyName: '사이오닉', gasName: '융화소', gasB: 'assimilator' },
  };

  D.PLAYER_COLORS = ['#f43f2e', '#2e64f4', '#2ec4b6', '#a545e0', '#ff8f1f', '#7a5230', '#e8e8e8', '#f4e42e'];
  D.PLAYER_COLOR_NAMES = ['빨강', '파랑', '청록', '보라', '주황', '갈색', '흰색', '노랑'];

  // ---- 유닛 ---------------------------------------------------------------
  // 필드: race, name, en, min/gas/sup(하프), bt(초), hp, sh, me(마나max), armor,
  //       size, spd(px/tick), sight(타일), g/a:{d,n,t,cd,r,up,splash,min}
  //       flags, cargo(수송 점유), slots(수송 능력), builtAt, req, hk, prio
  const U = {};

  // ======================= 테란 =======================
  U.scv = { race:'T', name:'건설로봇', en:'SCV', min:50, gas:0, sup:2, bt:13, hp:60, armor:0, size:0,
    spd:4.92, sight:7, g:{d:5,n:1,t:'n',cd:15,r:0.3,up:0}, flags:['worker','mech','bio'], cargo:1,
    builtAt:'command_center', hk:'s' };
  U.marine = { race:'T', name:'해병', en:'Marine', min:50, gas:0, sup:2, bt:15, hp:40, armor:0, size:0,
    spd:4.0, sight:7, g:{d:6,n:1,t:'n',cd:15,r:4,up:1}, a:{d:6,n:1,t:'n',cd:15,r:4,up:1},
    flags:['bio'], cargo:1, builtAt:'barracks', hk:'m', upG:'t_inf_w', upA:'t_inf_a' };
  U.firebat = { race:'T', name:'화염방사병', en:'Firebat', min:50, gas:25, sup:2, bt:15, hp:50, armor:1, size:0,
    spd:4.0, sight:7, g:{d:8,n:2,t:'c',cd:22,r:2,up:1,splash:'line'},
    flags:['bio'], cargo:1, builtAt:'barracks', req:['academy'], hk:'f', upG:'t_inf_w', upA:'t_inf_a' };
  U.medic = { race:'T', name:'의무병', en:'Medic', min:50, gas:25, sup:2, bt:19, hp:60, armor:1, size:0,
    spd:4.0, sight:9, me:200, flags:['bio','caster'], cargo:1, builtAt:'barracks', req:['academy'], hk:'c',
    abilities:['heal','restoration','optical_flare'], upA:'t_inf_a' };
  U.ghost = { race:'T', name:'유령', en:'Ghost', min:25, gas:75, sup:2, bt:31, hp:45, armor:0, size:0,
    spd:4.0, sight:9, me:200, g:{d:10,n:1,t:'c',cd:22,r:7,up:1}, a:{d:10,n:1,t:'c',cd:22,r:7,up:1},
    flags:['bio','caster'], cargo:1, builtAt:'barracks', req:['academy','covert_ops'], hk:'g',
    abilities:['cloak_ghost','lockdown','nuke_paint'], upG:'t_inf_w', upA:'t_inf_a' };
  U.vulture = { race:'T', name:'시체매', en:'Vulture', min:75, gas:0, sup:4, bt:19, hp:80, armor:0, size:1,
    spd:6.4, sight:8, g:{d:20,n:1,t:'c',cd:30,r:5,up:2}, flags:['mech'], cargo:2,
    builtAt:'factory', hk:'v', abilities:['mines'], upG:'t_veh_w', upA:'t_veh_a' };
  U.spider_mine = { race:'T', name:'거미 지뢰', en:'Spider Mine', min:0, gas:0, sup:0, bt:0, hp:20, armor:0, size:0,
    spd:16, sight:3, g:{d:125,n:1,t:'e',cd:22,r:0.5,up:0,splash:'full'}, flags:['mech','mine','noSelectCard'],
    hidden:true };
  U.scarab_proj = { race:'P', name:'갑충탄', en:'Scarab', min:0, gas:0, sup:0, bt:0, hp:20, armor:0, size:0,
    spd:16, sight:2, flags:['mech','noSelectCard'], hidden:true };
  U.siege_tank = { race:'T', name:'공성 전차', en:'Siege Tank', min:150, gas:100, sup:4, bt:31, hp:150, armor:1, size:2,
    spd:4.0, sight:10, g:{d:30,n:1,t:'e',cd:37,r:7,up:3}, flags:['mech'], cargo:4,
    builtAt:'factory', req:['machine_shop'], hk:'t', abilities:['siege'], upG:'t_veh_w', upA:'t_veh_a',
    siege:{d:70,n:1,t:'e',cd:75,r:12,min:2,up:5,splash:'full'} };
  U.goliath = { race:'T', name:'골리앗', en:'Goliath', min:100, gas:50, sup:4, bt:25, hp:125, armor:1, size:2,
    spd:4.57, sight:8, g:{d:12,n:1,t:'n',cd:22,r:6,up:1}, a:{d:10,n:2,t:'e',cd:22,r:5,up:2},
    flags:['mech'], cargo:2, builtAt:'factory', req:['armory'], hk:'g', upG:'t_veh_w', upA:'t_veh_a' };
  U.wraith = { race:'T', name:'망령', en:'Wraith', min:150, gas:100, sup:4, bt:38, hp:120, armor:0, size:2,
    spd:6.67, sight:7, me:200, g:{d:8,n:1,t:'n',cd:30,r:5,up:1}, a:{d:20,n:1,t:'e',cd:22,r:5,up:2},
    flags:['mech','flyer','caster'], builtAt:'starport', hk:'w', abilities:['cloak_wraith'],
    upG:'t_ship_w', upA:'t_ship_a' };
  U.dropship = { race:'T', name:'수송선', en:'Dropship', min:100, gas:100, sup:4, bt:31, hp:150, armor:1, size:2,
    spd:5.47, sight:8, flags:['mech','flyer','transport'], slots:8, builtAt:'starport', req:['control_tower'], hk:'d',
    upA:'t_ship_a' };
  U.science_vessel = { race:'T', name:'과학선', en:'Science Vessel', min:100, gas:225, sup:4, bt:50, hp:200, armor:1, size:2,
    spd:5.0, sight:10, me:200, flags:['mech','flyer','detector','caster'], builtAt:'starport',
    req:['control_tower','science_facility'], hk:'v', abilities:['dmatrix','emp','irradiate'], upA:'t_ship_a' };
  U.valkyrie = { race:'T', name:'발키리', en:'Valkyrie', min:250, gas:125, sup:6, bt:31, hp:200, armor:2, size:2,
    spd:6.6, sight:8, a:{d:6,n:8,t:'e',cd:64,r:6,up:1,splash:'full'}, flags:['mech','flyer'],
    builtAt:'starport', req:['control_tower','armory'], hk:'y', upG:'t_ship_w', upA:'t_ship_a' };
  U.battlecruiser = { race:'T', name:'전투순양함', en:'Battlecruiser', min:400, gas:300, sup:12, bt:84, hp:500, armor:3, size:2,
    spd:2.5, sight:11, me:200, g:{d:25,n:1,t:'n',cd:30,r:6,up:3}, a:{d:25,n:1,t:'n',cd:30,r:6,up:3},
    flags:['mech','flyer','caster'], builtAt:'starport', req:['control_tower','physics_lab'], hk:'b',
    abilities:['yamato'], upG:'t_ship_w', upA:'t_ship_a' };
  U.nuke = { race:'T', name:'핵미사일', en:'Nuke', min:200, gas:200, sup:16, bt:63, hp:100, armor:0, size:0,
    flags:['noSelectCard'], hidden:true, builtAt:'nuclear_silo' };

  // ======================= 저그 =======================
  U.larva = { race:'Z', name:'애벌레', en:'Larva', min:0, gas:0, sup:0, bt:0, hp:25, armor:10, size:0,
    spd:0.1, sight:4, flags:['bio','larva','noDeathScore'], hidden:true };
  U.egg = { race:'Z', name:'알', en:'Egg', min:0, gas:0, sup:0, bt:0, hp:200, armor:10, size:1,
    spd:0, sight:4, flags:['bio','egg'], hidden:true };
  U.drone = { race:'Z', name:'일벌레', en:'Drone', min:50, gas:0, sup:2, bt:13, hp:40, armor:0, size:0,
    spd:4.92, sight:7, g:{d:5,n:1,t:'n',cd:22,r:0.3,up:0}, flags:['worker','bio','burrowable'], cargo:1,
    builtAt:'hatchery', hk:'d', upA:'z_cara' };
  U.overlord = { race:'Z', name:'대군주', en:'Overlord', min:100, gas:0, sup:0, bt:25, hp:200, armor:0, size:2,
    spd:0.83, sight:9, provides:16, flags:['bio','flyer','detector','transport'], slots:8, builtAt:'hatchery', hk:'o', upA:'z_flyer_a' };
  U.zergling = { race:'Z', name:'저글링', en:'Zergling', min:50, gas:0, sup:1, bt:18, hp:35, armor:0, size:0,
    spd:5.49, sight:5, g:{d:5,n:1,t:'n',cd:8,r:0.3,up:1}, flags:['bio','burrowable'], cargo:1, pair:2,
    builtAt:'hatchery', req:['spawning_pool'], hk:'z', upG:'z_melee', upA:'z_cara' };
  U.hydralisk = { race:'Z', name:'히드라리스크', en:'Hydralisk', min:75, gas:25, sup:2, bt:18, hp:80, armor:0, size:1,
    spd:3.66, sight:6, g:{d:10,n:1,t:'e',cd:15,r:4,up:1}, a:{d:10,n:1,t:'e',cd:15,r:4,up:1},
    flags:['bio','burrowable'], cargo:2, builtAt:'hatchery', req:['hydralisk_den'], hk:'h',
    upG:'z_missile', upA:'z_cara' };
  U.lurker = { race:'Z', name:'가시지옥', en:'Lurker', min:50, gas:100, sup:4, bt:25, hp:125, armor:1, size:1,
    spd:5.82, sight:8, g:{d:20,n:1,t:'n',cd:37,r:6,up:2,splash:'line',needBurrow:true},
    flags:['bio','burrowable','lurker'], cargo:4, morphFrom:'hydralisk', req:['lurker_aspect'], hk:'l',
    upG:'z_missile', upA:'z_cara' };
  U.mutalisk = { race:'Z', name:'뮤탈리스크', en:'Mutalisk', min:100, gas:100, sup:4, bt:25, hp:120, armor:0, size:0,
    spd:6.67, sight:7, g:{d:9,n:1,t:'n',cd:30,r:3,up:1,bounce:true}, a:{d:9,n:1,t:'n',cd:30,r:3,up:1,bounce:true},
    flags:['bio','flyer'], builtAt:'hatchery', req:['spire'], hk:'m', upG:'z_flyer_w', upA:'z_flyer_a' };
  U.scourge = { race:'Z', name:'갈귀', en:'Scourge', min:25, gas:75, sup:1, bt:19, hp:25, armor:0, size:0,
    spd:6.67, sight:5, a:{d:110,n:1,t:'n',cd:1,r:0.3,up:0,suicide:true}, flags:['bio','flyer'], pair:2,
    builtAt:'hatchery', req:['spire'], hk:'s', upA:'z_flyer_a' };
  U.queen = { race:'Z', name:'여왕', en:'Queen', min:100, gas:100, sup:4, bt:31, hp:120, armor:0, size:1,
    spd:6.67, sight:10, me:200, flags:['bio','flyer','caster'], builtAt:'hatchery', req:['queens_nest'], hk:'q',
    abilities:['parasite','ensnare','broodlings','infest'], upA:'z_flyer_a' };
  U.defiler = { race:'Z', name:'파멸충', en:'Defiler', min:50, gas:150, sup:4, bt:31, hp:80, armor:1, size:1,
    spd:4.0, sight:10, me:200, flags:['bio','burrowable','caster'], cargo:2, builtAt:'hatchery',
    req:['defiler_mound'], hk:'f', abilities:['dark_swarm','consume','plague'], upA:'z_cara' };
  U.ultralisk = { race:'Z', name:'울트라리스크', en:'Ultralisk', min:200, gas:200, sup:8, bt:38, hp:400, armor:1, size:2,
    spd:5.12, sight:7, g:{d:20,n:1,t:'n',cd:15,r:0.6,up:3}, flags:['bio'], cargo:4,
    builtAt:'hatchery', req:['ultralisk_cavern'], hk:'u', upG:'z_melee', upA:'z_cara' };
  U.guardian = { race:'Z', name:'수호군주', en:'Guardian', min:50, gas:100, sup:4, bt:25, hp:150, armor:2, size:2,
    spd:2.5, sight:11, g:{d:20,n:1,t:'n',cd:30,r:8,up:2}, flags:['bio','flyer'],
    morphFrom:'mutalisk', req:['greater_spire'], hk:'g', upG:'z_flyer_w', upA:'z_flyer_a' };
  U.devourer = { race:'Z', name:'포식귀', en:'Devourer', min:150, gas:50, sup:4, bt:25, hp:250, armor:2, size:2,
    spd:5.0, sight:10, a:{d:25,n:1,t:'e',cd:100,r:6,up:2,spores:true}, flags:['bio','flyer'],
    morphFrom:'mutalisk', req:['greater_spire'], hk:'v', upG:'z_flyer_w', upA:'z_flyer_a' };
  U.broodling = { race:'Z', name:'공생충', en:'Broodling', min:0, gas:0, sup:0, bt:0, hp:30, armor:0, size:0,
    spd:6.0, sight:5, g:{d:4,n:1,t:'n',cd:15,r:0.3,up:1}, flags:['bio','timed'], life:4320, hidden:true,
    upG:'z_melee', upA:'z_cara' };
  U.infested_terran = { race:'Z', name:'감염된 테란', en:'Infested Terran', min:100, gas:50, sup:2, bt:25, hp:60, armor:0, size:0,
    spd:5.82, sight:5, g:{d:500,n:1,t:'e',cd:1,r:0.3,up:0,suicide:true,splash:'full'}, flags:['bio','burrowable'],
    cargo:1, builtAt:'infested_command_center', hk:'i', hidden:true };

  // ======================= 프로토스 =======================
  U.probe = { race:'P', name:'탐사정', en:'Probe', min:50, gas:0, sup:2, bt:13, hp:20, sh:20, armor:0, size:0,
    spd:4.92, sight:8, g:{d:5,n:1,t:'n',cd:22,r:0.3,up:0}, flags:['worker','mech','robotic'], cargo:1,
    builtAt:'nexus', hk:'p', upA:'p_ground_a' };
  U.zealot = { race:'P', name:'광전사', en:'Zealot', min:100, gas:0, sup:4, bt:25, hp:100, sh:60, armor:1, size:0,
    spd:4.0, sight:7, g:{d:8,n:2,t:'n',cd:22,r:0.3,up:1}, flags:['bio'], cargo:2,
    builtAt:'gateway', hk:'z', upG:'p_ground_w', upA:'p_ground_a' };
  U.dragoon = { race:'P', name:'용기병', en:'Dragoon', min:125, gas:50, sup:4, bt:31, hp:100, sh:80, armor:1, size:2,
    spd:5.0, sight:8, g:{d:20,n:1,t:'e',cd:30,r:4,up:2}, a:{d:20,n:1,t:'e',cd:30,r:4,up:2},
    flags:['mech','robotic2'], cargo:4, builtAt:'gateway', req:['cybernetics_core'], hk:'d',
    upG:'p_ground_w', upA:'p_ground_a' };
  U.high_templar = { race:'P', name:'고위 기사', en:'High Templar', min:50, gas:150, sup:4, bt:31, hp:40, sh:40, armor:0, size:0,
    spd:3.2, sight:7, me:200, flags:['bio','caster'], cargo:2, builtAt:'gateway', req:['templar_archives'], hk:'t',
    abilities:['storm','hallucination','merge_archon'], upA:'p_ground_a' };
  U.dark_templar = { race:'P', name:'암흑 기사', en:'Dark Templar', min:125, gas:100, sup:4, bt:31, hp:80, sh:40, armor:1, size:0,
    spd:4.92, sight:7, g:{d:40,n:1,t:'n',cd:30,r:0.6,up:3}, flags:['bio','permaCloak'], cargo:2,
    builtAt:'gateway', req:['templar_archives'], hk:'k', abilities:['merge_dark_archon'],
    upG:'p_ground_w', upA:'p_ground_a' };
  U.archon = { race:'P', name:'집정관', en:'Archon', min:0, gas:0, sup:8, bt:0, hp:10, sh:350, armor:0, size:2,
    spd:4.92, sight:8, g:{d:30,n:1,t:'n',cd:20,r:2,up:3,splash:'full'}, a:{d:30,n:1,t:'n',cd:20,r:2,up:3,splash:'full'},
    flags:['bio'], mergeFrom:'high_templar', mergeTime:13, hk:'r', upG:'p_ground_w', upA:'p_ground_a' };
  U.dark_archon = { race:'P', name:'암흑 집정관', en:'Dark Archon', min:0, gas:0, sup:8, bt:0, hp:25, sh:200, armor:1, size:2,
    spd:4.92, sight:10, me:200, flags:['bio','caster'], mergeFrom:'dark_templar', mergeTime:13, hk:'r',
    abilities:['feedback','maelstrom','mind_control'], upA:'p_ground_a' };
  U.shuttle = { race:'P', name:'왕복선', en:'Shuttle', min:200, gas:0, sup:4, bt:38, hp:80, sh:60, armor:1, size:2,
    spd:4.43, sight:8, flags:['mech','robotic','flyer','transport'], slots:8,
    builtAt:'robotics_facility', hk:'s', upA:'p_air_a' };
  U.reaver = { race:'P', name:'파괴자', en:'Reaver', min:200, gas:100, sup:8, bt:44, hp:100, sh:80, armor:0, size:2,
    spd:1.78, sight:10, g:{d:100,n:1,t:'n',cd:60,r:8,up:0,scarab:true,splash:'full'},
    flags:['mech','robotic'], cargo:4, builtAt:'robotics_facility', req:['robotics_support_bay'], hk:'v',
    scarabCost:15, scarabMax:5 };
  U.observer = { race:'P', name:'관측선', en:'Observer', min:25, gas:75, sup:2, bt:25, hp:40, sh:20, armor:0, size:0,
    spd:3.33, sight:9, flags:['mech','robotic','flyer','detector','permaCloak'],
    builtAt:'robotics_facility', req:['observatory'], hk:'o', upA:'p_air_a' };
  U.scout = { race:'P', name:'정찰기', en:'Scout', min:275, gas:125, sup:6, bt:50, hp:150, sh:100, armor:0, size:2,
    spd:5.0, sight:8, g:{d:8,n:1,t:'n',cd:30,r:4,up:1}, a:{d:14,n:2,t:'e',cd:22,r:4,up:1},
    flags:['mech','flyer'], builtAt:'stargate', hk:'s', upG:'p_air_w', upA:'p_air_a' };
  U.corsair = { race:'P', name:'해적선', en:'Corsair', min:150, gas:100, sup:4, bt:25, hp:100, sh:80, armor:1, size:1,
    spd:6.67, sight:9, me:200, a:{d:5,n:1,t:'e',cd:9,r:5,up:1,splash:'full'},
    flags:['mech','flyer','caster'], builtAt:'stargate', hk:'o', abilities:['dweb'], upG:'p_air_w', upA:'p_air_a' };
  U.carrier = { race:'P', name:'우주모함', en:'Carrier', min:350, gas:250, sup:12, bt:88, hp:300, sh:150, armor:4, size:2,
    spd:3.33, sight:11, flags:['mech','flyer','carrier'], builtAt:'stargate', req:['fleet_beacon'], hk:'c',
    interceptorMax:4 };
  U.interceptor = { race:'P', name:'요격기', en:'Interceptor', min:25, gas:0, sup:0, bt:13, hp:40, sh:40, armor:0, size:0,
    spd:13.3, sight:6, g:{d:6,n:1,t:'n',cd:37,r:1,up:1}, a:{d:6,n:1,t:'n',cd:37,r:1,up:1},
    flags:['mech','flyer','interceptor'], hidden:true, upG:'p_air_w' };
  U.arbiter = { race:'P', name:'중재자', en:'Arbiter', min:100, gas:350, sup:8, bt:100, hp:200, sh:150, armor:1, size:2,
    spd:5.0, sight:9, me:200, g:{d:10,n:1,t:'e',cd:45,r:5,up:1}, a:{d:10,n:1,t:'e',cd:45,r:5,up:1},
    flags:['mech','flyer','caster','cloakField'], builtAt:'stargate', req:['arbiter_tribunal'], hk:'a',
    abilities:['recall','stasis'], upG:'p_air_w', upA:'p_air_a' };

  D.units = U;

  // ---- 건물 ---------------------------------------------------------------
  // tiles:[w,h], provides(하프서플라이), trains:[], researches:[], addonOf, addons:[]
  const B = {};

  // 테란
  B.command_center = { race:'T', name:'사령부', en:'Command Center', min:400, gas:0, bt:75, hp:1500, armor:1,
    tiles:[4,3], provides:20, trains:['scv'], addons:['comsat_station','nuclear_silo'], hk:'c', prio:1,
    flags:['hall','liftoff'] };
  B.comsat_station = { race:'T', name:'통신 위성', en:'Comsat Station', min:50, gas:50, bt:25, hp:500, armor:1,
    tiles:[2,2], addonOf:'command_center', req:['academy'], me:200, abilities:['scan'], hk:'c' };
  B.nuclear_silo = { race:'T', name:'핵 격납고', en:'Nuclear Silo', min:100, gas:100, bt:50, hp:600, armor:1,
    tiles:[2,2], addonOf:'command_center', req:['science_facility','covert_ops'], trains:['nuke'], hk:'n' };
  B.supply_depot = { race:'T', name:'보급고', en:'Supply Depot', min:100, gas:0, bt:25, hp:500, armor:1,
    tiles:[3,2], provides:16, hk:'s', prio:2 };
  B.refinery = { race:'T', name:'정제소', en:'Refinery', min:100, gas:0, bt:25, hp:750, armor:1,
    tiles:[4,2], flags:['gas'], hk:'r' };
  B.barracks = { race:'T', name:'병영', en:'Barracks', min:150, gas:0, bt:50, hp:1000, armor:1,
    tiles:[4,3], trains:['marine','firebat','medic','ghost'], hk:'b', flags:['liftoff'], prio:3 };
  B.engineering_bay = { race:'T', name:'공학 연구소', en:'Engineering Bay', min:125, gas:0, bt:38, hp:850, armor:1,
    tiles:[4,3], researches:['t_inf_w','t_inf_a'], hk:'e', flags:['liftoff'] };
  B.bunker = { race:'T', name:'벙커', en:'Bunker', min:100, gas:0, bt:19, hp:350, armor:1,
    tiles:[3,2], req:['barracks'], slots:4, flags:['bunker'], hk:'u' };
  B.missile_turret = { race:'T', name:'미사일 포탑', en:'Missile Turret', min:75, gas:0, bt:19, hp:200, armor:0,
    tiles:[2,2], req:['engineering_bay'], a:{d:20,n:1,t:'e',cd:15,r:7,up:0}, flags:['detector','defense'], hk:'t' };
  B.academy = { race:'T', name:'사관학교', en:'Academy', min:150, gas:0, bt:50, hp:600, armor:1,
    tiles:[3,2], req:['barracks'], researches:['stim_pack','u238','caduceus','restoration','optical_flare'], hk:'a' };
  B.factory = { race:'T', name:'군수공장', en:'Factory', min:200, gas:100, bt:50, hp:1250, armor:1,
    tiles:[4,3], req:['barracks'], trains:['vulture','siege_tank','goliath'], addons:['machine_shop'],
    hk:'f', flags:['liftoff'] };
  B.machine_shop = { race:'T', name:'기계 상점', en:'Machine Shop', min:50, gas:50, bt:25, hp:750, armor:1,
    tiles:[2,2], addonOf:'factory', researches:['ion_thrusters','spider_mines','siege_tech'], hk:'m' };
  B.starport = { race:'T', name:'우주공항', en:'Starport', min:150, gas:100, bt:44, hp:1300, armor:1,
    tiles:[4,3], req:['factory'], trains:['wraith','dropship','science_vessel','valkyrie','battlecruiser'],
    addons:['control_tower'], hk:'s', flags:['liftoff'] };
  B.control_tower = { race:'T', name:'관제탑', en:'Control Tower', min:50, gas:50, bt:25, hp:500, armor:1,
    tiles:[2,2], addonOf:'starport', researches:['cloaking_field','apollo_reactor'], hk:'c' };
  B.science_facility = { race:'T', name:'과학 시설', en:'Science Facility', min:100, gas:150, bt:38, hp:850, armor:1,
    tiles:[4,3], req:['starport'], researches:['emp_shockwave','irradiate_tech','titan_reactor'],
    addons:['covert_ops','physics_lab'], hk:'i', flags:['liftoff'] };
  B.covert_ops = { race:'T', name:'비밀 작전실', en:'Covert Ops', min:50, gas:50, bt:25, hp:750, armor:1,
    tiles:[2,2], addonOf:'science_facility', researches:['lockdown_tech','personnel_cloaking','ocular_implants','moebius_reactor'], hk:'c' };
  B.physics_lab = { race:'T', name:'물리 연구실', en:'Physics Lab', min:50, gas:50, bt:25, hp:600, armor:1,
    tiles:[2,2], addonOf:'science_facility', researches:['yamato_tech','colossus_reactor'], hk:'p' };
  B.infested_command_center = { race:'Z', name:'감염된 사령부', en:'Infested Command Center', min:0, gas:0, bt:0,
    hp:1500, armor:1, tiles:[4,3], trains:['infested_terran'], hidden:true, hk:'i' };
  B.armory = { race:'T', name:'무기고', en:'Armory', min:100, gas:50, bt:50, hp:750, armor:1,
    tiles:[3,2], req:['factory'], researches:['t_veh_w','t_veh_a','t_ship_w','t_ship_a','charon_boosters'], hk:'r' };

  // 저그
  B.hatchery = { race:'Z', name:'부화장', en:'Hatchery', min:300, gas:0, bt:75, hp:1250, armor:1,
    tiles:[4,3], provides:2, trains:[], flags:['hall','larvaSpawner','creepSource'], hk:'h', prio:1,
    morphTo:'lair' };
  B.lair = { race:'Z', name:'번식지', en:'Lair', min:150, gas:100, bt:63, hp:1800, armor:1,
    tiles:[4,3], provides:2, req:['spawning_pool'], flags:['hall','larvaSpawner','creepSource'],
    researches:['ventral_sacs','antennae','pneumatized_carapace'], morphTo:'hive', hidden:true };
  B.hive = { race:'Z', name:'군락', en:'Hive', min:200, gas:150, bt:75, hp:2500, armor:1,
    tiles:[4,3], provides:2, req:['queens_nest'], flags:['hall','larvaSpawner','creepSource'],
    researches:['ventral_sacs','antennae','pneumatized_carapace'], hidden:true };
  B.creep_colony = { race:'Z', name:'점막 군체', en:'Creep Colony', min:75, gas:0, bt:12, hp:400, armor:0,
    tiles:[2,2], flags:['creepSource','needCreep'], morphChoices:['sunken_colony','spore_colony'], hk:'c' };
  B.sunken_colony = { race:'Z', name:'가시 촉수', en:'Sunken Colony', min:50, gas:0, bt:12, hp:300, armor:2,
    tiles:[2,2], req:['spawning_pool'], g:{d:40,n:1,t:'e',cd:32,r:7,up:0}, flags:['defense','creepSource','needCreep'],
    hidden:true, hk:'s' };
  B.spore_colony = { race:'Z', name:'포자 군체', en:'Spore Colony', min:50, gas:0, bt:12, hp:400, armor:0,
    tiles:[2,2], req:['evolution_chamber'], a:{d:15,n:1,t:'n',cd:15,r:7,up:0},
    flags:['defense','detector','creepSource','needCreep'], hidden:true, hk:'p' };
  B.extractor = { race:'Z', name:'추출장', en:'Extractor', min:50, gas:0, bt:25, hp:750, armor:1,
    tiles:[4,2], flags:['gas'], hk:'e' };
  B.spawning_pool = { race:'Z', name:'산란못', en:'Spawning Pool', min:200, gas:0, bt:50, hp:750, armor:1,
    tiles:[3,2], flags:['needCreep'], researches:['metabolic_boost','adrenal_glands'], hk:'s' };
  B.evolution_chamber = { race:'Z', name:'진화장', en:'Evolution Chamber', min:75, gas:0, bt:25, hp:750, armor:1,
    tiles:[3,2], flags:['needCreep'], researches:['z_melee','z_missile','z_cara'], hk:'v' };
  B.hydralisk_den = { race:'Z', name:'히드라리스크 굴', en:'Hydralisk Den', min:100, gas:50, bt:25, hp:850, armor:1,
    tiles:[3,2], req:['spawning_pool'], flags:['needCreep'],
    researches:['muscular_augments','grooved_spines','lurker_aspect'], hk:'d' };
  B.spire = { race:'Z', name:'둥지탑', en:'Spire', min:200, gas:150, bt:75, hp:600, armor:1,
    tiles:[2,2], req:['lair'], flags:['needCreep'], researches:['z_flyer_w','z_flyer_a'],
    morphTo:'greater_spire', hk:'s' };
  B.greater_spire = { race:'Z', name:'거대 둥지탑', en:'Greater Spire', min:100, gas:150, bt:75, hp:1000, armor:1,
    tiles:[2,2], req:['hive'], flags:['needCreep'], researches:['z_flyer_w','z_flyer_a'], hidden:true };
  B.queens_nest = { race:'Z', name:'여왕의 둥지', en:"Queen's Nest", min:150, gas:100, bt:38, hp:850, armor:1,
    tiles:[3,2], req:['lair'], flags:['needCreep'], researches:['ensnare_tech','broodlings_tech','gamete_meiosis'], hk:'n' };
  B.ultralisk_cavern = { race:'Z', name:'울트라리스크 동굴', en:'Ultralisk Cavern', min:150, gas:200, bt:50, hp:600, armor:1,
    tiles:[3,2], req:['hive'], flags:['needCreep'], researches:['anabolic_synthesis','chitinous_plating'], hk:'u' };
  B.defiler_mound = { race:'Z', name:'파멸충 언덕', en:'Defiler Mound', min:100, gas:100, bt:38, hp:850, armor:1,
    tiles:[4,2], req:['hive'], flags:['needCreep'], researches:['consume_tech','plague_tech','metasynaptic_node'], hk:'d' };
  B.nydus_canal = { race:'Z', name:'땅굴망', en:'Nydus Canal', min:150, gas:0, bt:25, hp:250, armor:1,
    tiles:[2,2], req:['hive'], flags:['needCreep','nydus'], hk:'a' };
  B.burrow_tech_dummy = null; delete B.burrow_tech_dummy;

  // 프로토스
  B.nexus = { race:'P', name:'연결체', en:'Nexus', min:400, gas:0, bt:75, hp:750, sh:750, armor:1,
    tiles:[4,3], provides:18, trains:['probe'], flags:['hall'], hk:'n', prio:1 };
  B.pylon = { race:'P', name:'수정탑', en:'Pylon', min:100, gas:0, bt:19, hp:300, sh:300, armor:0,
    tiles:[2,2], provides:16, flags:['pylon'], powerRadius:5, hk:'p', prio:2 };
  B.assimilator = { race:'P', name:'융화소', en:'Assimilator', min:100, gas:0, bt:25, hp:450, sh:450, armor:1,
    tiles:[4,2], flags:['gas'], hk:'a' };
  B.gateway = { race:'P', name:'관문', en:'Gateway', min:150, gas:0, bt:38, hp:500, sh:500, armor:1,
    tiles:[4,3], req:['nexus'], needPower:true, trains:['zealot','dragoon','high_templar','dark_templar'], hk:'g', prio:3 };
  B.forge = { race:'P', name:'제련소', en:'Forge', min:150, gas:0, bt:25, hp:550, sh:550, armor:1,
    tiles:[3,2], needPower:true, researches:['p_ground_w','p_ground_a','p_shields'], hk:'f' };
  B.photon_cannon = { race:'P', name:'광자포', en:'Photon Cannon', min:150, gas:0, bt:31, hp:100, sh:100, armor:0,
    tiles:[2,2], req:['forge'], needPower:true, g:{d:20,n:1,t:'n',cd:22,r:7,up:0}, a:{d:20,n:1,t:'n',cd:22,r:7,up:0},
    flags:['defense','detector'], hk:'c' };
  B.cybernetics_core = { race:'P', name:'인공제어소', en:'Cybernetics Core', min:200, gas:0, bt:38, hp:500, sh:500, armor:1,
    tiles:[3,2], req:['gateway'], needPower:true, researches:['p_air_w','p_air_a','singularity_charge'], hk:'y' };
  B.shield_battery = { race:'P', name:'보호막 충전소', en:'Shield Battery', min:100, gas:0, bt:19, hp:200, sh:200, armor:1,
    tiles:[3,2], req:['gateway'], needPower:true, me:200, flags:['battery'], hk:'b' };
  B.citadel_of_adun = { race:'P', name:'아둔의 성채', en:'Citadel of Adun', min:150, gas:100, bt:38, hp:450, sh:450, armor:1,
    tiles:[3,2], req:['cybernetics_core'], needPower:true, researches:['leg_enhancements'], hk:'c' };
  B.templar_archives = { race:'P', name:'기사단 기록보관소', en:'Templar Archives', min:150, gas:200, bt:38, hp:500, sh:500, armor:1,
    tiles:[3,2], req:['citadel_of_adun'], needPower:true,
    researches:['psionic_storm_tech','hallucination_tech','khaydarin_amulet','maelstrom_tech','mind_control_tech','argus_talisman'], hk:'t' };
  B.robotics_facility = { race:'P', name:'로봇공학 시설', en:'Robotics Facility', min:200, gas:200, bt:50, hp:500, sh:500, armor:1,
    tiles:[3,2], req:['cybernetics_core'], needPower:true, trains:['shuttle','reaver','observer'], hk:'r' };
  B.robotics_support_bay = { race:'P', name:'로봇공학 지원소', en:'Robotics Support Bay', min:150, gas:100, bt:19, hp:450, sh:450, armor:1,
    tiles:[3,2], req:['robotics_facility'], needPower:true,
    researches:['scarab_damage','reaver_capacity','gravitic_drive'], hk:'b' };
  B.observatory = { race:'P', name:'관측소', en:'Observatory', min:50, gas:100, bt:19, hp:250, sh:250, armor:1,
    tiles:[3,2], req:['robotics_facility'], needPower:true, researches:['gravitic_boosters','sensor_array'], hk:'o' };
  B.stargate = { race:'P', name:'우주관문', en:'Stargate', min:150, gas:150, bt:44, hp:600, sh:600, armor:1,
    tiles:[4,3], req:['cybernetics_core'], needPower:true, trains:['scout','corsair','carrier','arbiter'], hk:'s' };
  B.fleet_beacon = { race:'P', name:'함대 신호소', en:'Fleet Beacon', min:300, gas:200, bt:38, hp:500, sh:500, armor:1,
    tiles:[3,2], req:['stargate'], needPower:true,
    researches:['carrier_capacity','disruption_web_tech','argus_jewel','apial_sensors','gravitic_thrusters'], hk:'f' };
  B.arbiter_tribunal = { race:'P', name:'중재자 재판소', en:'Arbiter Tribunal', min:200, gas:150, bt:38, hp:500, sh:500, armor:1,
    tiles:[3,2], req:['templar_archives','stargate'], needPower:true,
    researches:['recall_tech','stasis_tech','khaydarin_core'], hk:'a' };

  D.buildings = B;

  // ---- 업그레이드 / 연구 -----------------------------------------------------
  // lv: 최대 레벨, cost:[[m,g,t]...], effect
  const R = {};
  const tier3 = (m1, g1, inc, t1) => [
    [m1, g1, t1], [m1 + inc, g1 + inc, t1 + 13], [m1 + inc * 2, g1 + inc * 2, t1 + 26]];

  // 무기/방어 업그레이드 (3단계)
  R.t_inf_w = { name:'보병 무기', lv:3, cost:tier3(100, 100, 75, 166), at:'engineering_bay', tierReq:[null,'science_facility','science_facility'] };
  R.t_inf_a = { name:'보병 장갑', lv:3, cost:tier3(100, 100, 75, 166), at:'engineering_bay', tierReq:[null,'science_facility','science_facility'] };
  R.t_veh_w = { name:'차량 무기', lv:3, cost:tier3(100, 100, 75, 166), at:'armory', tierReq:[null,'science_facility','science_facility'] };
  R.t_veh_a = { name:'차량 장갑', lv:3, cost:tier3(100, 100, 75, 166), at:'armory', tierReq:[null,'science_facility','science_facility'] };
  R.t_ship_w = { name:'함선 무기', lv:3, cost:tier3(100, 100, 50, 166), at:'armory', tierReq:[null,'science_facility','science_facility'] };
  R.t_ship_a = { name:'함선 장갑', lv:3, cost:tier3(150, 150, 75, 166), at:'armory', tierReq:[null,'science_facility','science_facility'] };
  R.z_melee = { name:'근접 공격', lv:3, cost:tier3(100, 100, 50, 166), at:'evolution_chamber', tierReq:[null,'lair','hive'] };
  R.z_missile = { name:'원거리 공격', lv:3, cost:tier3(100, 100, 50, 166), at:'evolution_chamber', tierReq:[null,'lair','hive'] };
  R.z_cara = { name:'갑피', lv:3, cost:tier3(150, 150, 75, 166), at:'evolution_chamber', tierReq:[null,'lair','hive'] };
  R.z_flyer_w = { name:'공중 공격', lv:3, cost:tier3(100, 100, 75, 166), at:'spire', tierReq:[null,'lair','hive'] };
  R.z_flyer_a = { name:'공중 갑피', lv:3, cost:tier3(150, 150, 75, 166), at:'spire', tierReq:[null,'lair','hive'] };
  R.p_ground_w = { name:'지상 무기', lv:3, cost:tier3(100, 100, 50, 166), at:'forge', tierReq:[null,'templar_archives','templar_archives'] };
  R.p_ground_a = { name:'지상 장갑', lv:3, cost:tier3(100, 100, 75, 166), at:'forge', tierReq:[null,'templar_archives','templar_archives'] };
  R.p_shields = { name:'플라즈마 보호막', lv:3, cost:tier3(200, 200, 100, 166), at:'forge', tierReq:[null,'cybernetics_core','cybernetics_core'] };
  R.p_air_w = { name:'공중 무기', lv:3, cost:tier3(100, 100, 75, 166), at:'cybernetics_core', tierReq:[null,'fleet_beacon','fleet_beacon'] };
  R.p_air_a = { name:'공중 장갑', lv:3, cost:tier3(150, 150, 75, 166), at:'cybernetics_core', tierReq:[null,'fleet_beacon','fleet_beacon'] };

  // 테란 기술
  R.stim_pack = { name:'전투 자극제', lv:1, cost:[[100,100,50]], at:'academy' };
  R.u238 = { name:'U-238 탄환 (+1 사거리)', lv:1, cost:[[150,150,63]], at:'academy' };
  R.caduceus = { name:'카두세우스 반응로 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'academy' };
  R.restoration = { name:'회복', lv:1, cost:[[100,100,50]], at:'academy' };
  R.optical_flare = { name:'조명탄', lv:1, cost:[[100,100,75]], at:'academy' };
  R.ion_thrusters = { name:'이온 추진기 (시체매 속도)', lv:1, cost:[[100,100,63]], at:'machine_shop' };
  R.spider_mines = { name:'거미 지뢰', lv:1, cost:[[100,100,50]], at:'machine_shop' };
  R.siege_tech = { name:'공성 모드', lv:1, cost:[[150,150,50]], at:'machine_shop' };
  R.charon_boosters = { name:'카론 부스터 (+3 대공 사거리)', lv:1, cost:[[100,100,50]], at:'armory', req:['science_facility'] };
  R.cloaking_field = { name:'은폐장 (망령)', lv:1, cost:[[150,150,63]], at:'control_tower' };
  R.apollo_reactor = { name:'아폴로 반응로 (+50 에너지)', lv:1, cost:[[200,200,104]], at:'control_tower' };
  R.emp_shockwave = { name:'EMP 충격파', lv:1, cost:[[200,200,75]], at:'science_facility' };
  R.irradiate_tech = { name:'방사능 오염', lv:1, cost:[[200,200,50]], at:'science_facility' };
  R.titan_reactor = { name:'타이탄 반응로 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'science_facility' };
  R.lockdown_tech = { name:'구속 미사일', lv:1, cost:[[200,200,63]], at:'covert_ops' };
  R.personnel_cloaking = { name:'개인 은폐 (유령)', lv:1, cost:[[100,100,50]], at:'covert_ops' };
  R.ocular_implants = { name:'안구 이식 (+2 시야)', lv:1, cost:[[100,100,104]], at:'covert_ops' };
  R.moebius_reactor = { name:'뫼비우스 반응로 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'covert_ops' };
  R.yamato_tech = { name:'야마토 포', lv:1, cost:[[100,100,75]], at:'physics_lab' };
  R.colossus_reactor = { name:'콜로서스 반응로 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'physics_lab' };

  // 저그 기술
  R.burrow_tech = { name:'잠복', lv:1, cost:[[100,100,50]], at:'hatchery' };
  R.metabolic_boost = { name:'대사 촉진 (저글링 속도)', lv:1, cost:[[100,100,63]], at:'spawning_pool' };
  R.adrenal_glands = { name:'아드레날린 분비선 (저글링 공속)', lv:1, cost:[[200,200,63]], at:'spawning_pool', req:['hive'] };
  R.muscular_augments = { name:'근육 강화 (히드라 속도)', lv:1, cost:[[150,150,63]], at:'hydralisk_den' };
  R.grooved_spines = { name:'홈 파인 가시 (+1 사거리)', lv:1, cost:[[150,150,63]], at:'hydralisk_den' };
  R.lurker_aspect = { name:'가시지옥 변이', lv:1, cost:[[200,200,75]], at:'hydralisk_den', req:['lair'] };
  R.ventral_sacs = { name:'배쪽 주머니 (수송)', lv:1, cost:[[200,200,100]], at:'lair' };
  R.antennae = { name:'더듬이 (+2 시야)', lv:1, cost:[[150,150,83]], at:'lair' };
  R.pneumatized_carapace = { name:'기낭 갑피 (대군주 속도)', lv:1, cost:[[150,150,83]], at:'lair' };
  R.ensnare_tech = { name:'올가미', lv:1, cost:[[100,100,50]], at:'queens_nest' };
  R.broodlings_tech = { name:'공생충 부화', lv:1, cost:[[100,100,50]], at:'queens_nest' };
  R.gamete_meiosis = { name:'생식세포 감수분열 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'queens_nest' };
  R.anabolic_synthesis = { name:'동화 합성 (울트라 속도)', lv:1, cost:[[200,200,83]], at:'ultralisk_cavern' };
  R.chitinous_plating = { name:'키틴질 장갑 (+2 방어)', lv:1, cost:[[150,150,83]], at:'ultralisk_cavern' };
  R.consume_tech = { name:'섭취', lv:1, cost:[[100,100,63]], at:'defiler_mound' };
  R.plague_tech = { name:'역병', lv:1, cost:[[200,200,63]], at:'defiler_mound' };
  R.metasynaptic_node = { name:'초신경절 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'defiler_mound' };

  // 프로토스 기술
  R.singularity_charge = { name:'특이점 충전 (+2 사거리)', lv:1, cost:[[150,150,105]], at:'cybernetics_core' };
  R.leg_enhancements = { name:'다리 강화 (광전사 속도)', lv:1, cost:[[150,150,83]], at:'citadel_of_adun' };
  R.psionic_storm_tech = { name:'사이오닉 폭풍', lv:1, cost:[[200,200,76]], at:'templar_archives' };
  R.hallucination_tech = { name:'환상', lv:1, cost:[[150,150,50]], at:'templar_archives' };
  R.khaydarin_amulet = { name:'케이다린 부적 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'templar_archives' };
  R.maelstrom_tech = { name:'대혼란', lv:1, cost:[[100,100,63]], at:'templar_archives' };
  R.mind_control_tech = { name:'정신 지배', lv:1, cost:[[200,200,75]], at:'templar_archives' };
  R.argus_talisman = { name:'아르거스 부적 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'templar_archives' };
  R.scarab_damage = { name:'갑충탄 피해 (+25)', lv:1, cost:[[200,200,104]], at:'robotics_support_bay' };
  R.reaver_capacity = { name:'파괴자 적재량 (+5)', lv:1, cost:[[200,200,104]], at:'robotics_support_bay' };
  R.gravitic_drive = { name:'중력 구동 (왕복선 속도)', lv:1, cost:[[200,200,104]], at:'robotics_support_bay' };
  R.gravitic_boosters = { name:'중력 부스터 (관측선 속도)', lv:1, cost:[[150,150,84]], at:'observatory' };
  R.sensor_array = { name:'감지 배열 (+2 시야)', lv:1, cost:[[150,150,84]], at:'observatory' };
  R.carrier_capacity = { name:'요격기 적재량 (+4)', lv:1, cost:[[100,100,63]], at:'fleet_beacon' };
  R.disruption_web_tech = { name:'분열망', lv:1, cost:[[200,200,50]], at:'fleet_beacon' };
  R.argus_jewel = { name:'아르거스 보석 (+50 에너지)', lv:1, cost:[[100,100,104]], at:'fleet_beacon' };
  R.apial_sensors = { name:'정점 감지기 (+2 시야)', lv:1, cost:[[100,100,104]], at:'fleet_beacon' };
  R.gravitic_thrusters = { name:'중력 추진기 (정찰기 속도)', lv:1, cost:[[200,200,104]], at:'fleet_beacon' };
  R.recall_tech = { name:'소환', lv:1, cost:[[150,150,75]], at:'arbiter_tribunal' };
  R.stasis_tech = { name:'정지장', lv:1, cost:[[150,150,63]], at:'arbiter_tribunal' };
  R.khaydarin_core = { name:'케이다린 핵 (+50 에너지)', lv:1, cost:[[150,150,104]], at:'arbiter_tribunal' };

  D.research = R;

  // ---- 어빌리티 -------------------------------------------------------------
  // target: unit/point/self/auto, en: 에너지, r: 사거리(타일)
  D.abilities = {
    heal:        { name:'치료', target:'auto', en:1, r:2, req:null, icon:'heal' },
    restoration: { name:'회복', target:'unit', en:50, r:6, req:'restoration', icon:'resto', hk:'o' },
    optical_flare:{ name:'조명탄', target:'unit', en:75, r:9, req:'optical_flare', icon:'flare', hk:'f' },
    infest:      { name:'사령부 감염', target:'unit', en:0, r:1, req:null, icon:'infest', hk:'i' },
    stim:        { name:'전투 자극제', target:'self', en:0, req:'stim_pack', icon:'stim', hk:'t' },
    siege:       { name:'공성 모드', target:'self', en:0, req:'siege_tech', icon:'siege', hk:'o' },
    unsiege:     { name:'전차 모드', target:'self', en:0, req:null, icon:'unsiege', hk:'o' },
    cloak_ghost: { name:'은폐', target:'toggle', en:25, drain:10, req:'personnel_cloaking', icon:'cloak', hk:'c' },
    cloak_wraith:{ name:'은폐장', target:'toggle', en:25, drain:13, req:'cloaking_field', icon:'cloak', hk:'c' },
    lockdown:    { name:'구속 미사일', target:'unit', en:100, r:8, req:'lockdown_tech', icon:'lockdown', hk:'l' },
    nuke_paint:  { name:'핵 조준', target:'point', en:0, r:9, req:null, icon:'nuke', hk:'n' },
    scan:        { name:'궤도 정찰', target:'point', en:50, r:999, req:null, icon:'scan', hk:'s' },
    mines:       { name:'거미 지뢰 매설', target:'point', en:0, r:1, req:'spider_mines', icon:'mine', hk:'i' },
    dmatrix:     { name:'방어막', target:'unit', en:100, r:10, req:null, icon:'dmatrix', hk:'d' },
    emp:         { name:'EMP 충격파', target:'point', en:100, r:8, req:'emp_shockwave', icon:'emp', hk:'e' },
    irradiate:   { name:'방사능 오염', target:'unit', en:75, r:9, req:'irradiate_tech', icon:'irradiate', hk:'i' },
    yamato:      { name:'야마토 포', target:'unit', en:150, r:10, req:'yamato_tech', icon:'yamato', hk:'y' },
    repair:      { name:'수리', target:'unit', en:0, r:0.5, req:null, icon:'repair', hk:'r' },
    burrow:      { name:'잠복', target:'self', en:0, req:'burrow_tech', icon:'burrow', hk:'u' },
    unburrow:    { name:'잠복 해제', target:'self', en:0, req:null, icon:'unburrow', hk:'u' },
    parasite:    { name:'기생충', target:'unit', en:75, r:12, req:null, icon:'parasite', hk:'p' },
    ensnare:     { name:'올가미', target:'point', en:75, r:9, req:'ensnare_tech', icon:'ensnare', hk:'e' },
    broodlings:  { name:'공생충 부화', target:'unit', en:150, r:9, req:'broodlings_tech', icon:'brood', hk:'b' },
    dark_swarm:  { name:'어둠의 무리', target:'point', en:100, r:9, req:null, icon:'swarm', hk:'w' },
    consume:     { name:'섭취', target:'unit', en:0, r:0.5, req:'consume_tech', icon:'consume', hk:'c' },
    plague:      { name:'역병', target:'point', en:150, r:9, req:'plague_tech', icon:'plague', hk:'g' },
    storm:       { name:'사이오닉 폭풍', target:'point', en:75, r:9, req:'psionic_storm_tech', icon:'storm', hk:'t' },
    hallucination:{ name:'환상', target:'unit', en:100, r:7, req:'hallucination_tech', icon:'hallu', hk:'h' },
    merge_archon:{ name:'집정관 합체', target:'self', en:0, req:null, icon:'archon', hk:'r' },
    merge_dark_archon:{ name:'암흑 집정관 합체', target:'self', en:0, req:'mind_control_tech_or_any', icon:'darchon', hk:'r' },
    feedback:    { name:'되먹임', target:'unit', en:50, r:10, req:null, icon:'feedback', hk:'f' },
    maelstrom:   { name:'대혼란', target:'point', en:100, r:10, req:'maelstrom_tech', icon:'mael', hk:'e' },
    mind_control:{ name:'정신 지배', target:'unit', en:150, r:8, req:'mind_control_tech', icon:'mc', hk:'c' },
    recall:      { name:'소환', target:'point', en:150, r:999, req:'recall_tech', icon:'recall', hk:'l' },
    stasis:      { name:'정지장', target:'point', en:100, r:9, req:'stasis_tech', icon:'stasis', hk:'t' },
    dweb:        { name:'분열망', target:'point', en:125, r:9, req:'disruption_web_tech', icon:'dweb', hk:'d' },
  };

  // ---- 스펠 수치 ------------------------------------------------------------
  // 수치 출처: Liquipedia (Fastest 기준, 1틱 = 1프레임)
  D.SPELL = {
    STORM_DMG: 112, STORM_TICKS: 64, STORM_R: 1.5,
    STIM_HP: 10, STIM_TICKS: 300,
    PLAGUE_DMG: 295, PLAGUE_TICKS: 600, PLAGUE_R: 2,
    IRRADIATE_DMG: 250, IRRADIATE_TICKS: 600, IRRADIATE_R: 1,
    YAMATO_DMG: 260,
    DMATRIX_HP: 250, DMATRIX_TICKS: 1350,
    EMP_R: 1.5,
    LOCKDOWN_TICKS: 1040,
    ENSNARE_TICKS: 600, ENSNARE_R: 2,
    MAELSTROM_TICKS: 178, MAELSTROM_R: 1.5,
    STASIS_TICKS: 1040, STASIS_R: 1.5,
    SWARM_TICKS: 900, SWARM_R: 3,
    DWEB_TICKS: 360, DWEB_R: 2,
    SCAN_TICKS: 240, SCAN_R: 10,
    BROODLING_COUNT: 2,
    CONSUME_ENERGY: 50,
    HEAL_HP_PER_E: 2, HEAL_RATE: 200,       // 200/256 HP per tick (Liquipedia)
    REPAIR_RATE: 90,                          // hp<<8 per tick
    NUKE_DMG: 500, NUKE_PCT: 2 / 3, NUKE_R: 6, NUKE_DELAY: 420,
    MINE_ARM: 72, MINE_SIGHT: 3, MINE_COUNT: 3,
    ACID_SPORE_TICKS: 1200,
    HALLU_TICKS: 1350, HALLU_COUNT: 2,
    RECALL_R: 2.5, RECALL_DELAY: 31,
  };

  // ---- 조회 도우미 ----------------------------------------------------------
  D.all = {};
  for (const k in U) { U[k].id = k; U[k].kind = 'unit'; D.all[k] = U[k]; }
  for (const k in B) { B[k].id = k; B[k].kind = 'building'; B[k].size = 2; D.all[k] = B[k]; }
  for (const k in R) R[k].id = k;

  D.buildMenu = {
    T: { basic: ['command_center','supply_depot','refinery','barracks','engineering_bay','bunker','missile_turret','academy'],
         adv:   ['factory','starport','armory','science_facility'] },
    Z: { basic: ['hatchery','creep_colony','extractor','spawning_pool','evolution_chamber','hydralisk_den'],
         adv:   ['spire','queens_nest','ultralisk_cavern','defiler_mound','nydus_canal'] },
    P: { basic: ['nexus','pylon','assimilator','gateway','forge','photon_cannon','cybernetics_core','shield_battery'],
         adv:   ['robotics_facility','stargate','citadel_of_adun','robotics_support_bay','observatory','templar_archives','fleet_beacon','arbiter_tribunal'] },
  };

  // 저그 부화장 유닛 생산 목록 (라바 기반)
  D.larvaTrains = ['drone','overlord','zergling','hydralisk','mutalisk','scourge','queen','defiler','ultralisk'];

  SC.DATA = D;
})();
