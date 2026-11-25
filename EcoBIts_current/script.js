(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const normalize = value => (value || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const config = window.ECOBITS_CONFIG || {};
  const supabaseReady = Boolean(window.supabase?.createClient && config.supabaseUrl?.startsWith("https://") && config.supabaseAnonKey && !config.supabaseAnonKey.includes("COLE_AQUI"));
  const db = supabaseReady ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  let collectionPoints = [];
  let googleMap = null;
  let googleMarkers = [];
  let geocoder = null;

  // Navegação e acessibilidade
  const header = $("#header"), menuBtn = $("#menuBtn"), menu = $("#menu"), backTop = $("#backTop");
  const closeMenu = () => { if (!menu || !menuBtn) return; menu.classList.remove("active"); menuBtn.textContent = "☰"; menuBtn.setAttribute("aria-expanded", "false"); menuBtn.setAttribute("aria-label", "Abrir menu"); document.body.classList.remove("menu-open"); };
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => { const opened = menu.classList.toggle("active"); menuBtn.textContent = opened ? "✕" : "☰"; menuBtn.setAttribute("aria-expanded", String(opened)); menuBtn.setAttribute("aria-label", opened ? "Fechar menu" : "Abrir menu"); document.body.classList.toggle("menu-open", opened); });
    $$("#menu a").forEach(a => a.addEventListener("click", closeMenu));
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
    window.addEventListener("resize", () => { if (innerWidth > 700) closeMenu(); });
  }
  $$('a[href^="#"]').forEach(link => link.addEventListener("click", event => { const id = link.getAttribute("href"); const target = id && id !== "#" ? $(id) : null; if (!target) return; event.preventDefault(); const top = target.getBoundingClientRect().top + scrollY - (header?.offsetHeight || 0); scrollTo({ top, behavior: "smooth" }); history.replaceState(null, "", id); }));
  const sections = $$("main section[id]"), navLinks = $$("#menu a");
  const updateScrollUI = () => { header?.classList.toggle("scrolled", scrollY > 50); backTop?.classList.toggle("show", scrollY > 500); let active = ""; sections.forEach(s => { const r = s.getBoundingClientRect(); if (r.top <= 180 && r.bottom > 180) active = s.id; }); navLinks.forEach(a => { const yes = a.getAttribute("href") === `#${active}`; a.classList.toggle("active", yes); if (yes) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); }); };
  addEventListener("scroll", updateScrollUI, { passive: true }); updateScrollUI();
  backTop?.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
  if ("IntersectionObserver" in window) { const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }), { threshold: .12 }); $$(".reveal").forEach(el => io.observe(el)); } else $$(".reveal").forEach(el => el.classList.add("visible"));
  const year = $("#year"); if (year) year.textContent = new Date().getFullYear();

  // Mapa Google Maps: usa a API oficial se houver chave; sem chave mantém busca incorporada.
  const mapCanvas = $("#collectionMapCanvas"), mapFallback = $("#collectionMapFallback"), mapSearch = $("#mapSearch"), mapCategory = $("#mapCategory"), mapStatus = $("#mapStatus"), openMaps = $("#openGoogleMaps");
  const categorySearch = { "eletrônicos": "reciclagem de eletrônicos", "celulares": "reciclagem de celulares", "computadores": "reciclagem de computadores", "pilhas e baterias": "pontos de coleta de pilhas e baterias" };
  const mapsQuery = (place = "Brasil") => `${categorySearch[mapCategory?.value] || "pontos de coleta de eletrônicos"} ${place} Brasil`;
  const setMapStatus = msg => { if (mapStatus) mapStatus.textContent = msg; };
  const updateFallbackMap = (place = mapSearch?.value.trim() || "Brasil") => { const q = mapsQuery(place); if (mapFallback) mapFallback.src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`; if (openMaps) openMaps.href = `https://www.google.com/maps/search/${encodeURIComponent(q)}/`; };
  const clearMarkers = () => { googleMarkers.forEach(m => m.setMap(null)); googleMarkers = []; };
  const addPointMarkers = points => { if (!googleMap || !window.google?.maps) return; clearMarkers(); points.forEach(p => { if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return; const marker = new google.maps.Marker({ map: googleMap, position: { lat: p.latitude, lng: p.longitude }, title: p.name }); const info = new google.maps.InfoWindow({ content: `<div style="max-width:220px"><strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.address || "")}, ${escapeHtml(p.city || "")}/${escapeHtml(p.state || "")}<br><small>Local aprovado pelo EcoBIts</small></div>` }); marker.addListener("click", () => info.open({ anchor: marker, map: googleMap })); googleMarkers.push(marker); }); };
  window.initEcoBitsGoogleMap = () => { if (!mapCanvas || !window.google?.maps) return; mapFallback?.classList.add("map-fallback-hidden"); mapCanvas.classList.add("map-canvas-ready"); googleMap = new google.maps.Map(mapCanvas, { center: { lat: -14.235, lng: -51.9253 }, zoom: 4, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "cooperative" }); geocoder = new google.maps.Geocoder(); addPointMarkers(collectionPoints); setMapStatus("Mapa Google ativo. Os marcadores representam pontos EcoBIts aprovados."); };
  if (config.googleMapsApiKey && !config.googleMapsApiKey.includes("COLE_AQUI")) { const s = document.createElement("script"); s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&callback=initEcoBitsGoogleMap&v=weekly`; s.async = true; s.defer = true; s.onerror = () => setMapStatus("Não foi possível carregar a API do Google Maps. A pesquisa incorporada continua disponível."); document.head.appendChild(s); }
  const searchMap = () => { const place = mapSearch?.value.trim(); if (!place) { setMapStatus("Digite uma cidade ou endereço no Brasil."); mapSearch?.focus(); return; } updateFallbackMap(place); if (googleMap && geocoder) { geocoder.geocode({ address: `${place}, Brasil` }, (results, status) => { if (status === "OK" && results?.[0]) { googleMap.setCenter(results[0].geometry.location); googleMap.setZoom(13); setMapStatus(`Mapa centralizado em ${place}. Confira os pontos aprovados próximos.`); } else setMapStatus(`Não foi possível localizar ${place}. Confira a escrita ou use o Google Maps.`); }); } else setMapStatus(`Pesquisa por ${place} preparada no Google Maps. Configure a chave da API para mapa interativo com marcadores EcoBIts.`); };
  $("#mapSearchBtn")?.addEventListener("click", searchMap); mapSearch?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); searchMap(); } }); mapCategory?.addEventListener("change", () => { updateFallbackMap(); if (mapSearch?.value.trim()) searchMap(); });
  $("#mapLocateBtn")?.addEventListener("click", () => { if (!navigator.geolocation) { setMapStatus("Seu navegador não oferece geolocalização. Digite sua cidade."); return; } const b = $("#mapLocateBtn"); b.disabled = true; const old = b.textContent; b.textContent = "Localizando…"; navigator.geolocation.getCurrentPosition(pos => { const p = pos.coords; userCoordinates = { lat: p.latitude, lng: p.longitude }; renderPoints(); if (mapSearch) mapSearch.value = `${p.latitude}, ${p.longitude}`; if (googleMap) { const loc = { lat: p.latitude, lng: p.longitude }; googleMap.setCenter(loc); googleMap.setZoom(13); } updateFallbackMap(`${p.latitude}, ${p.longitude}`); setMapStatus("Localização encontrada. Os pontos EcoBIts com coordenadas foram ordenados do mais próximo ao mais distante."); b.disabled = false; b.textContent = old; }, err => { setMapStatus(err.code === 1 ? "Permita o acesso à localização ou digite seu endereço." : "Não foi possível obter sua localização. Pesquise manualmente."); b.disabled = false; b.textContent = old; }, { timeout: 12000, maximumAge: 300000 }); });

  // Renderização segura dos pontos vindos do Supabase.
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  const pointsGrid = $("#pointsGrid"), noResults = $("#noResults"), searchPoint = $("#searchPoint"), filterType = $("#filterType");
  const materialLabels = { eletronicos: "Eletrônicos", celulares: "Celulares", computadores: "Computadores", pilhas_baterias: "Pilhas e baterias", cabos_acessorios: "Cabos e acessórios" };
  let userCoordinates = null;
  const distanceKm = (aLat, aLng, bLat, bLng) => {
    const rad = n => n * Math.PI / 180;
    const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  function renderPoints() {
    if (!pointsGrid) return;
    const query = normalize(searchPoint?.value), type = filterType?.value || "todos";
    const visible = collectionPoints.filter(p => {
      const hay = normalize([p.name, p.city, p.state, p.address, ...(p.accepted_materials || [])].join(" "));
      return (!query || hay.includes(query)) && (type === "todos" || (p.accepted_materials || []).includes(type));
    }).map(p => {
      const hasCoords = p.latitude != null && p.longitude != null && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
      return { ...p, distance: userCoordinates && hasCoords
        ? distanceKm(userCoordinates.lat, userCoordinates.lng, Number(p.latitude), Number(p.longitude))
        : null };
    });
    if (userCoordinates) visible.sort((a, b) => {
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
    pointsGrid.innerHTML = visible.map(p => {
      const address = [p.address, p.city, p.state].filter(Boolean).join(", ");
      const directions = p.latitude != null && p.longitude != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
      const distance = p.distance == null ? "" : `<span class="point-distance">📍 ${p.distance < 1 ? `${Math.round(p.distance * 1000)} m` : `${p.distance.toFixed(1).replace(".", ",")} km`} de você</span>`;
      return `<article class="point-card reveal"><div class="point-top"><div class="point-icon">♻</div><span class="point-status">APROVADO</span></div><h3>${escapeHtml(p.name)}</h3><p class="point-location">${escapeHtml([p.city, p.state].filter(Boolean).join(" — "))}</p><p class="point-address">${escapeHtml(address)}</p>${distance}<div class="accepted">${(p.accepted_materials || []).map(m => `<span>${escapeHtml(materialLabels[m] || m)}</span>`).join("")}</div><div class="point-footer"><span>${escapeHtml(p.phone || "Consulte o estabelecimento")}</span><a href="${directions}" target="_blank" rel="noopener noreferrer">Como chegar →</a></div></article>`;
    }).join("");
    if (noResults) noResults.hidden = visible.length !== 0;
    $$(".point-card.reveal:not(.visible)").forEach(el => el.classList.add("visible"));
    const nearbyStatus = $("#nearbyStatus");
    if (nearbyStatus) nearbyStatus.textContent = userCoordinates
      ? `${visible.filter(p => p.distance != null).length} ponto(s) com localização cadastrada ordenado(s) pela distância.`
      : "";
  }
  searchPoint?.addEventListener("input", renderPoints); filterType?.addEventListener("change", renderPoints);
  async function loadPoints() { if (!db) { setMapStatus("Supabase ainda não configurado. A busca do Google Maps está disponível; os pontos próprios aparecerão após configurar o banco."); if (noResults) noResults.hidden = false; return; } const { data, error } = await db.from("collection_points").select("id,name,address,city,state,phone,latitude,longitude,accepted_materials").eq("status", "verified").order("name"); if (error) { setMapStatus("Não foi possível carregar os pontos EcoBIts. Verifique o SQL e as políticas de acesso do Supabase."); console.error("Erro ao carregar pontos:", error.message); return; } collectionPoints = data || []; renderPoints(); addPointMarkers(collectionPoints); setMapStatus(`${collectionPoints.length} ponto(s) aprovado(s) carregado(s) do EcoBIts.`); }

  // Guia inteligente de descarte: orientações práticas e filtro do mapa/lista.
  const guideData = {
    celular: {
      label: "celulares e tablets", material: "celulares", map: "celulares",
      intro: "Antes de entregar o aparelho, proteja seus dados e acessórios.",
      steps: [
        "Faça backup do que deseja guardar e saia das contas vinculadas ao aparelho.",
        "Restaure as configurações de fábrica e remova chip e cartão de memória, se possível.",
        "Separe carregador e acessórios; confirme se o ponto recebe esses itens.",
        "Não coloque o aparelho no lixo comum nem tente abrir a bateria."
      ]
    },
    computador: {
      label: "computadores e notebooks", material: "computadores", map: "computadores",
      intro: "Prepare o equipamento e proteja seus arquivos pessoais.",
      steps: [
        "Faça backup dos arquivos importantes.",
        "Desconecte cabos e periféricos e, se o equipamento ainda funcionar, apague seus dados com segurança.",
        "Não desmonte o equipamento por conta própria, especialmente se houver bateria interna.",
        "Confirme se o ponto recebe computadores, monitores e periféricos separadamente."
      ]
    },
    pilhas: {
      label: "pilhas e baterias", material: "pilhas_baterias", map: "pilhas e baterias",
      intro: "Pilhas e baterias precisam de coleta específica.",
      steps: [
        "Guarde as pilhas usadas em recipiente seco, longe de calor e umidade.",
        "Se possível, proteja os terminais de baterias soltas com fita não condutiva.",
        "Não perfure, esmague, abra ou misture baterias danificadas com resíduos comuns.",
        "Leve a um ponto que informe explicitamente receber pilhas ou baterias."
      ]
    },
    cabos: {
      label: "cabos e acessórios", material: "cabos_acessorios", map: "eletrônicos",
      intro: "Cabos e acessórios também podem conter materiais reaproveitáveis.",
      steps: [
        "Separe cabos, carregadores, fones e periféricos por tipo.",
        "Retire apenas itens removíveis sem ferramentas e sem danificar o produto.",
        "Não queime nem descasque fios para retirar metais.",
        "Confirme se o ponto recebe cabos e acessórios antes de sair."
      ]
    },
    outro: {
      label: "outros eletrônicos", material: "eletronicos", map: "eletrônicos",
      intro: "O destino depende do tipo e do tamanho do equipamento.",
      steps: [
        "Identifique o equipamento e separe acessórios removíveis.",
        "Se houver dados pessoais, faça backup e apague as informações quando possível.",
        "Não desmonte, quebre ou queime o equipamento.",
        "Entre em contato com o ponto para confirmar se recebe esse tipo de eletrônico."
      ]
    }
  };
  const guideDevice = $("#guideDevice"), guideCondition = $("#guideCondition"), guideResult = $("#guideResult");
  let selectedGuide = null;
  $("#guideGenerate")?.addEventListener("click", () => {
    const data = guideData[guideDevice?.value || "celular"];
    const condition = guideCondition?.value || "funciona";
    selectedGuide = data;
    $("#guideResultTitle").textContent = `Como descartar ${data.label}`;
    $("#guideResultIntro").textContent = data.intro;
    const steps = [...data.steps];
    if (condition === "quebrado") steps.splice(steps.length - 1, 0, "Informe ao estabelecimento que o equipamento não liga ou está danificado.");
    if (condition === "danificado") {
      steps.unshift("ATENÇÃO: não carregue, pressione, perfure nem tente remover a bateria.");
      steps.push("Mantenha o item afastado de calor e materiais inflamáveis e procure orientação especializada antes do transporte.");
    }
    $("#guideSteps").innerHTML = steps.map(step => `<li>${escapeHtml(step)}</li>`).join("");
    guideResult.hidden = false;
    guideResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("#guideFindPoints")?.addEventListener("click", () => {
    if (!selectedGuide) return;
    if (filterType) filterType.value = selectedGuide.material;
    if (mapCategory) mapCategory.value = selectedGuide.map;
    if (searchPoint) searchPoint.value = "";
    renderPoints();
    updateFallbackMap(mapSearch?.value.trim() || "Brasil");
    if (mapSearch?.value.trim()) searchMap();
    $("#pontos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMapStatus(`Filtro aplicado para ${selectedGuide.label}. Os pontos próprios exibidos são apenas os aprovados no EcoBIts.`);
  });

  // Formulário de contato permanece como fallback de e-mail, sem backend próprio.
  $("#contactForm")?.addEventListener("submit", e => { e.preventDefault(); const form = e.currentTarget; if (!form.reportValidity()) return; const name = $("#name")?.value.trim() || "", email = $("#email")?.value.trim() || "", subject = $("#subject")?.value || "Contato EcoBIts", body = `Nome: ${name}\nE-mail: ${email}\n\n${$("#message")?.value.trim() || ""}`; const msg = $("#formMessage"); message(msg, "Seu aplicativo de e-mail será aberto com a mensagem pronta. Configure um endereço de destino antes de publicar.", true); window.location.href = `mailto:?subject=${encodeURIComponent(`[EcoBIts] ${subject}`)}&body=${encodeURIComponent(body)}`; });

  updateFallbackMap(); loadPoints();
})();
