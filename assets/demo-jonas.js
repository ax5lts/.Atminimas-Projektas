(function (global) {
  var layout = {
    __stage: { background: "#f2ede4" },
    header: { left: "8%", top: "3%", width: "84%" },
    text: { left: "9%", top: "15%", width: "82%" },
    "photo-1": {
      left: "10%",
      top: "34%",
      width: "80%",
      heightPct: "70",
      fit: "crop",
      objectPosition: "50% 34%"
    },
    "photo-2": {
      left: "7%",
      top: "58%",
      width: "42%",
      heightPct: "42",
      fit: "crop",
      objectPosition: "50% 50%"
    },
    "photo-3": {
      left: "51%",
      top: "58%",
      width: "42%",
      heightPct: "42",
      fit: "crop",
      objectPosition: "50% 50%"
    },
    "photo-4": {
      left: "10%",
      top: "73%",
      width: "80%",
      heightPct: "62",
      fit: "crop",
      objectPosition: "50% 50%"
    },
    video: { left: "8%", top: "91%", width: "84%", heightPct: "47" }
  };

  var media = [
    {
      type: "image",
      url: "assets/demo-jonas-portretas.jpg",
      order: 1,
      caption: "Jonas šeimos sode, 2019 m.",
      alt: "Fikcinio Jono Mačiulio portretas obelų sode"
    },
    {
      type: "image",
      url: "assets/demo-jonas-seima.jpg",
      order: 2,
      caption: "Prie Baltijos jūros su šeima, 1986 m.",
      alt: "Fikcinis Jonas su žmona ir dviem vaikais Baltijos pajūryje"
    },
    {
      type: "image",
      url: "assets/demo-jonas-dirbtuves.jpg",
      order: 3,
      caption: "Dirbtuvėse taisant anūkui skirtą inkilą, 2017 m.",
      alt: "Fikcinis Jonas medžio dirbtuvėse taiso inkilą"
    },
    {
      type: "image",
      url: "assets/demo-jonas-sodas.jpg",
      order: 4,
      caption: "Rudens popietė sode su anūku, 2021 m.",
      alt: "Fikcinis Jonas su anūku eina per obelų sodą"
    }
  ];

  var story = [
    "Jonas gimė 1948 metų balandžio 12 dieną nedideliame Lietuvos miestelyje. Nuo vaikystės jis mėgo būti lauke, pažinojo kiekvieną tėvų sodo obelį ir anksti išmoko vertinti paprastus, gerai padarytus darbus.",
    "Baigęs mokslus Jonas pasirinko staliaus amatą. Jo rankomis pagaminti stalai, suolai ir lentynos liko ne vienuose namuose, tačiau artimieji labiausiai prisimena ne pačius daiktus, o kantrybę, su kuria jis mokė kitus. Jonas visada sakydavo, kad skubėti galima einant, bet ne kuriant tai, kas turi tarnauti ilgai.",
    "Su žmona Ona jis užaugino du vaikus. Šeimos vasaros dažnai prabėgdavo prie Baltijos jūros, o ruduo – renkant obuolius ir verdant sultis. Jonas mokėjo suburti žmones be didelių kalbų: užtekdavo atidaryti dirbtuvių duris, užkaisti arbatą ir paklausti, kuo gali padėti.",
    "Tapęs seneliu jis kiekvienam anūkui pagamino po inkilą ir išmokė atpažinti pirmuosius pavasario paukščius. Sekmadieniais Jonas mėgo lėtai apeiti sodą, pataisyti tvorą, pasikalbėti su kaimynu ir grįžti namo su keliomis kišenėse paslėptomis karamelėmis vaikams.",
    "Artimiesiems Jonas liko žmogumi, šalia kurio buvo ramu. Jo gyvenimas primena, kad didžiausią pėdsaką dažnai palieka kasdienis gerumas, ištartas pažadas ir darbas, atliktas taip, lyg jis būtų skirtas brangiausiam žmogui."
  ].join("\n\n");

  var profile = {
    id: "jonas-maciulis-pavyzdys",
    vardas: "Jonas",
    pavarde: "Mačiulis",
    gimimo_data: "1948-04-12",
    mirties_data: "2024-10-03",
    epitafija: "Jo gerumas liko darbuose, o šiluma – žmonių atmintyje.",
    tekstas_200: story,
    layout_json: layout,
    media_json: media,
    aktyvus: true,
    apmoketa: true,
    demo: true
  };

  global.AtminimasDemo = {
    jonas: {
      profile: profile,
      layout: layout,
      media: media
    },
    isJonasIdentifier: function (value) {
      return ["demo", "jonas", "jonas-maciulis-pavyzdys"].indexOf(String(value || "").toLowerCase()) !== -1;
    }
  };
})(window);
