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
      url: "assets/maironis-portretas-1900.jpg",
      order: 1,
      caption: "Maironis Sankt Peterburge, apie 1900–1905 m. Fotografas Julijus Šteinbergas.",
      alt: "Jauno Maironio portretinė nuotrauka su kunigo drabužiais ir akiniais, apie 1900–1905 metus",
      sourceName: "Wikimedia Commons · Maironio lietuvių literatūros muziejus / Europeana",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Maironis_around_1900-1905.jpeg",
      license: "Viešoji sritis (Public Domain)"
    },
    {
      type: "image",
      url: "assets/maironis-portretas-1908.jpg",
      order: 2,
      caption: "Maironio portretas, 1908 m. Fotografas nežinomas.",
      alt: "Maironis su kunigo drabužiais, akiniais ir medalionu 1908 metų portretinėje nuotraukoje",
      sourceName: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:%D0%9C%D0%B0%D0%B9%D1%80%D0%BE%D0%BD%D1%96%D1%81_(%D0%99%D0%BE%D0%BD%D0%B0%D1%81_%D0%9C%D0%B0%D1%87%D1%8E%D0%BB%D1%96%D1%81).jpg",
      license: "Viešoji sritis (Public Domain)"
    },
    {
      type: "image",
      url: "assets/maironis-darbo-kabinete-1912.jpg",
      order: 3,
      caption: "Maironis darbo kabinete Kaune, apie 1912 m.",
      alt: "Maironis sėdi darbo kabinete prie stalo, rankoje laiko atverstą knygą, apie 1912 metus",
      sourceName: "Europeana · Maironio lietuvių literatūros muziejus",
      sourceUrl: "https://www.europeana.eu/lt/item/2024906/photography_ProvidedCHO_Maironio_lietuvi__literat_ros_muziejus_LIMIS_4055675",
      license: "Viešoji sritis (Public Domain)"
    },
    {
      type: "image",
      url: "assets/maironis-siluvoje-1912.jpg",
      order: 4,
      caption: "Maironis šventina Šiluvos koplyčios pamatus, 1912 m. liepos 2 d.",
      alt: "Maironis ir susirinkusi minia per Šiluvos Švenčiausiosios Mergelės Marijos koplyčios pamatų šventinimą 1912 metais",
      sourceName: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Maironis_Siluvoje.jpg",
      license: "Viešoji sritis (Public Domain)"
    }
  ];

  var story = [
    "Maironis, tikrasis vardas Jonas Mačiulis, gimė 1862 metų lapkričio 2 dieną Pasandravyje, Raseinių krašte, o augo netoliese esančiuose Bernotuose. Jis tapo vienu žymiausių XIX amžiaus pabaigos ir XX amžiaus pradžios lietuvių poetų.",
    "Baigęs Kauno gimnaziją, Jonas Mačiulis trumpai studijavo literatūrą Kijevo universitete. Vėliau mokėsi Kauno kunigų seminarijoje ir Sankt Peterburgo dvasinėje katalikų akademijoje. 1891 metais buvo įšventintas kunigu.",
    "Maironis dėstė Kauno kunigų seminarijoje ir Sankt Peterburgo dvasinėje katalikų akademijoje. 1909 metais grįžo į Kauną ir iki gyvenimo pabaigos vadovavo Kauno kunigų seminarijai. Jis taip pat dėstė Lietuvos universitete, dirbo akademinį bei visuomeninį darbą.",
    "Maironio kūryboje svarbios Lietuvos istorijos, kraštovaizdžio, tikėjimo ir tautinio atgimimo temos. 1895 metais pasirodė pirmasis poezijos rinkinio „Pavasario balsai“ leidimas. Tarp gerai žinomų jo kūrinių yra „Lietuva brangi“, „Trakų pilis“, „Kur bėga Šešupė“ ir lyrinė poema „Jaunoji Lietuva“.",
    "Nuo 1909 metų Maironis gyveno Kauno Rotušės aikštėje esančiuose namuose, kuriuose dabar veikia Maironio lietuvių literatūros muziejus. Poetas mirė 1932 metų birželio 28 dieną Kaune ir buvo palaidotas Kauno arkikatedros bazilikos kriptoje. Jo kūryba iki šiol yra svarbi Lietuvos kultūrinei atminčiai."
  ].join("\n\n");

  var profile = {
    id: "maironis-pavyzdys",
    vardas: "Jonas",
    pavarde: "Mačiulis-Maironis",
    gimimo_data: "1862-11-02",
    mirties_data: "1932-06-28",
    epitafija: "Poeto žodis liko gyvas Lietuvos atmintyje.",
    tekstas_200: story,
    layout_json: layout,
    media_json: media,
    aktyvus: true,
    apmoketa: true,
    demo: true
  };

  var demo = {
    profile: profile,
    layout: layout,
    media: media
  };

  function isMaironisIdentifier(value) {
    return ["demo", "maironis", "maironis-pavyzdys", "jonas", "jonas-maciulis-pavyzdys"]
      .indexOf(String(value || "").toLowerCase()) !== -1;
  }

  global.AtminimasDemo = {
    maironis: demo,
    jonas: demo,
    isMaironisIdentifier: isMaironisIdentifier,
    isJonasIdentifier: isMaironisIdentifier
  };
})(window);
