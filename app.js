const defaultLocations = [
	...Array.from({ length: 7 }, (_, i) => String(100 + i)),
	...Array.from({ length: 9 }, (_, i) => String(200 + i)),
	...Array.from({ length: 18 }, (_, i) => String(300 + i)),
	...Array.from({ length: 10 }, (_, i) => String(400 + i)),
	...Array.from({ length: 10 }, (_, i) => String(500 + i)),
	...Array.from({ length: 12 }, (_, i) => `Understock ${i + 1}`),
	"Vault Holds",
	"Vault ICM Bin",
	"Vault Retags",
	"Vault",
	...[
		"Adam",
		"Mandy",
		"Jose",
		"Roman",
		"Donovan",
		"Saima",
		"Larkin",
		"Virginia",
		"Dennis",
		"Roberto",
		"Sunita",
		"Christopher",
	].map((n) => `BA bin: ${n}`),
];
const fieldAliases = {
	sku: [
		"sku",
		"sku/upc",
		"sku upc",
		"upc code",
		"upc number",
		"item number",
		"item #",
		"item no",
		"product code",
		"barcode",
		"upc",
		"scan upc",
		"plu",
		"stock number",
		"inventory number",
		"ean",
		"gtin",
	],
	description: [
		"description",
		"item description",
		"product description",
		"product name",
		"name",
	],
	style: [
		"style",
		"style number",
		"style #",
		"model",
		"model number",
		"design",
		"clu",
	],
	quantity: [
		"quantity",
		"qty",
		"on hand",
		"on-hand",
		"on hand qty",
		"count",
		"total qty",
		"inventory qty",
	],
	price: ["sale price", "sell price", "price", "retail price"],
	salesFloor: ["sales floor", "ats", "available to sell"],
	category: [
		"case code",
		"casecode",
		"case category",
		"category",
		"case",
		"audit category",
		"location category",
		"group",
	],
};
let locations = [...defaultLocations],
	inventory = [],
	columns = [],
	mapping = {
		sku: -1,
		description: -1,
		style: -1,
		quantity: -1,
		price: -1,
		salesFloor: -1,
		category: -1,
	},
	audits = [],
	activeAuditId = null,
	selectedCategory = null,
	selectedCategories = [],
	selectedDashboardAudits = [],
	rawRows = [],
	currentSourceName = "",
	currentSourceImportedAt = null,
	currentSourceUrl = null;
const $ = (id) => document.getElementById(id);
const norm = (s) =>
	String(s ?? "")
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ");
function scanKey(value) {
	let v = String(value ?? "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "");
	if (/^\d+\.0+$/.test(v)) v = v.replace(/\.0+$/, "");
	return v;
}
function identifiersMatch(a, b) {
	const x = scanKey(a),
		y = scanKey(b);
	if (!x || !y) return false;
	if (x === y) return true;
	const digitsX = x.replace(/\D/g, ""),
		digitsY = y.replace(/\D/g, "");
	return (
		/^\d+$/.test(x) &&
		/^\d+$/.test(y) &&
		digitsX.replace(/^0+(?=\d)/, "") === digitsY.replace(/^0+(?=\d)/, "")
	);
}
function toast(msg) {
	const el = $("toast");
	el.textContent = msg;
	el.classList.add("show");
	clearTimeout(window._toastTimer);
	window._toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function showView(name) {
	if (name === "audit-workspace") {
		const a = activeAudit();
		if (!a || !a.items?.length) {
			toast("Import inventory and create an audit from the dashboard first.");
			return false;
		}
		if (a.status === "completed") {
			toast(
				"This audit is closed. Reopen it from Closed audits with manager authorization.",
			);
			return false;
		}
		if (a.status === "in-progress" && !a.startedConfirmed) {
			toast("Select the audit on the dashboard and choose Start audit.");
			return false;
		}
	}
	const current = activeAudit();
	if (
		current &&
		current.status === "in-progress" &&
		name !== "audit-workspace"
	) {
		const ok = confirm(
			"This audit is still in progress. Complete it before leaving, or choose OK to leave it open and return later.",
		);
		if (!ok) return false;
	}
	if (name !== "audit-workspace")
		document.querySelector(".app").classList.remove("audit-fullscreen");
	document
		.querySelectorAll(".view")
		.forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
	document
		.querySelectorAll("[data-view]")
		.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
	const titles = {
		dashboard: "Audit dashboard",
		"new-audit": "Build an audit",
		"audit-workspace": "Audit workspace",
		settings: "Settings",
	};
	$("page-title").textContent = titles[name] || "Inventory audit";
	if (name === "new-audit") renderBuilder();
	if (name === "settings") renderSettings();
	if (name === "dashboard") renderDashboard();
	if (name === "audit-workspace") {
		renderWorkspace();
		document.querySelector(".app").classList.add("audit-fullscreen");
	}
	window.scrollTo({ top: 0, behavior: "smooth" });
	return true;
}
document
	.querySelectorAll("[data-view]")
	.forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
const mobileMenu = $("mobile-menu-backdrop"),
	mobileMenuTrigger = $("mobile-menu-trigger");
function closeMobileMenu() {
	if (!mobileMenu) return;
	mobileMenu.classList.remove("open");
	mobileMenu.setAttribute("aria-hidden", "true");
	mobileMenuTrigger?.setAttribute("aria-expanded", "false");
	document.body.style.overflow = "";
}
function openMobileMenu() {
	if (
		!mobileMenu ||
		document.querySelector(".app")?.classList.contains("audit-fullscreen")
	)
		return;
	mobileMenu.classList.add("open");
	mobileMenu.setAttribute("aria-hidden", "false");
	mobileMenuTrigger?.setAttribute("aria-expanded", "true");
	document.body.style.overflow = "hidden";
}
mobileMenuTrigger?.addEventListener("click", openMobileMenu);
$("mobile-menu-close")?.addEventListener("click", closeMobileMenu);
mobileMenu?.addEventListener("click", (e) => {
	if (e.target === mobileMenu) closeMobileMenu();
	if (e.target.closest("[data-view]")) closeMobileMenu();
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeMobileMenu();
});

$("top-new").onclick = $("dashboard-build").onclick = () =>
	showView("new-audit");
$("top-source-replace").onclick = $("builder-import").onclick = () =>
	$("file-input").click();
$("top-source").onclick = () => {
	if (currentSourceUrl) {
		const opened = window.open(currentSourceUrl, "_blank", "noopener");
		if (!opened)
			toast(
				"Your browser blocked the source preview. Use the browser share/open options or allow pop-ups for this app.",
			);
	} else $("file-input").click();
};
$("file-input").addEventListener("change", async (e) => {
	const file = e.target.files[0];
	if (!file) return;
	try {
		let rows,
			sourceWorkbook = null;
		if (file.name.toLowerCase().endsWith(".csv")) {
			rows = parseCSV(await file.text());
		} else {
			if (!window.XLSX)
				throw new Error(
					"Excel reader could not load. Check your internet connection and try importing again.",
				);
			const buf = await file.arrayBuffer();
			sourceWorkbook = XLSX.read(buf, { type: "array", cellDates: false });
			const preferred = sourceWorkbook.SheetNames.find(
				(n) => norm(n) === "report",
			);
			let bestRows = null,
				bestScore = -1;
			for (const name of sourceWorkbook.SheetNames) {
				const candidate = XLSX.utils.sheet_to_json(
					sourceWorkbook.Sheets[name],
					{ header: 1, defval: "", raw: false },
				);
				const score = scoreHeaderRows(candidate);
				if (name === preferred) {
					bestRows = candidate;
					bestScore = score;
					break;
				}
				if (score > bestScore) {
					bestRows = candidate;
					bestScore = score;
				}
			}
			rows = bestRows || [];
		}
		if (!rows.length)
			throw new Error(
				"The selected workbook appears to be empty or its worksheets could not be read.",
			);
		// Find the real header row rather than assuming headers are on row 1. Some inventory
		// exports have report metadata or two-level headings before the actual column names.
		const headerInfo = findInventoryHeader(rows);
		if (!headerInfo)
			throw new Error(
				"I opened the file but could not find recognizable inventory headers. Please check that the workbook contains columns such as UPC, Product Description, and On Hand.",
			);
		columns = headerInfo.columns;
		const dataStart = headerInfo.dataStart;
		rawRows = rows
			.slice(dataStart)
			.filter((r) => r.some((v) => String(v ?? "").trim() !== ""));
		mapping = autoMap(columns);
		if (mapping.sku < 0)
			throw new Error(
				"I found the headers (" +
					columns.filter(Boolean).join(", ") +
					") but could not identify the UPC/SKU column. Open Settings → Inventory column mapping and select the UPC column.",
			);
		inventory = normalizeRows(rawRows);
		if (!inventory.length)
			throw new Error(
				"The headers were found, including “" +
					columns[mapping.sku] +
					"”, but no inventory rows contained values in that column. Check the UPC mapping and try again.",
			);
		currentSourceName = file.name;
		currentSourceImportedAt = new Date().toISOString();
		if (currentSourceUrl) URL.revokeObjectURL(currentSourceUrl);
		currentSourceUrl = URL.createObjectURL(file);
		$("top-source").textContent = file.name;
		$("top-source").title = `Open current source file: ${file.name}`;
		$("top-source-replace").title = "Replace current inventory source";
		$("top-source-replace").style.display = "inline-flex";
		toast(`Imported ${inventory.length} inventory rows from ${file.name}`);
		renderDashboard();
		renderBuilder();
		renderMapping();
	} catch (err) {
		toast(err.message || "Could not import workbook");
	}
	e.target.value = "";
});
function headerRowScore(row) {
	const cells = (row || []).map((v) => norm(v));
	let score = 0;
	const groups = [
		[
			"upc",
			"upc code",
			"upc number",
			"barcode",
			"sku",
			"sku upc",
			"sku/upc",
			"ean",
			"gtin",
		],
		["product description", "description", "item description", "product name"],
		["on hand", "on hand qty", "quantity", "qty"],
		["case code", "casecode", "category"],
		["clu", "style", "style number", "sell price", "sale price", "ats", "plu"],
	];
	groups.forEach((group) => {
		if (
			cells.some((c) => group.some((t) => c === norm(t) || c.includes(norm(t))))
		)
			score += 1;
	});
	return score;
}
function scoreHeaderRows(rows) {
	let best = 0;
	for (let i = 0; i < Math.min(rows.length, 20); i++) {
		best = Math.max(best, headerRowScore(rows[i]));
		if (i + 1 < rows.length) {
			const merged = (rows[i] || []).map((v, j) =>
				String(v || rows[i + 1]?.[j] || ""),
			);
			best = Math.max(best, headerRowScore(merged));
		}
	}
	return best;
}
function findInventoryHeader(rows) {
	let best = null,
		bestScore = 0;
	for (let i = 0; i < Math.min(rows.length, 30); i++) {
		const current = rows[i] || [],
			next = rows[i + 1] || [];
		// Prefer real column names in the row, but merge the next row for two-level exports.
		const merged = current.map((v, j) => {
			const a = String(v ?? "").trim(),
				b = String(next[j] ?? "").trim();
			if (!a) return b || `Column ${j + 1}`;
			if (!b) return a;
			const an = norm(a),
				bn = norm(b);
			if (["on hand", "ats", "sales floor", "available to sell"].includes(bn))
				return b;
			if (["on hand", "ats", "sales floor", "available to sell"].includes(an))
				return a;
			return a;
		});
		const score = headerRowScore(current),
			mergedScore = headerRowScore(merged);
		const useMerged = mergedScore > score;
		const chosen = useMerged
			? merged
			: current.map((v, j) => String(v ?? "").trim() || `Column ${j + 1}`);
		const finalScore = Math.max(score, mergedScore);
		if (finalScore > bestScore) {
			bestScore = finalScore;
			const hasSubheader = next.some((v) =>
				["on hand", "ats", "sales floor", "available to sell"].includes(
					norm(v),
				),
			);
			best = {
				columns: chosen.map(
					(v, j) => String(v ?? "").trim() || `Column ${j + 1}`,
				),
				dataStart: i + 1 + (hasSubheader ? 1 : 0),
				score: finalScore,
			};
		}
		if (score >= 3) break;
	}
	return bestScore >= 2 ? best : null;
}
function parseCSV(text) {
	const rows = [];
	let row = [],
		field = "",
		q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '"' && q && text[i + 1] === '"') {
			field += '"';
			i++;
		} else if (c === '"') q = !q;
		else if (c === "," && !q) {
			row.push(field);
			field = "";
		} else if ((c === "\n" || c === "\r") && !q) {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
function autoMap(cols) {
	const out = {};
	// Prefer exact, semantically specific headers over broad aliases. In the DY workbook
	// PLU appears before UPC; treating PLU as the primary scan code caused UPC scans to miss.
	const score = (field, header) => {
		const h = norm(header);
		if (!h) return 0;
		const priorities = {
			sku: [
				["upc", 120],
				["upc code", 118],
				["upc number", 118],
				["sku/upc", 116],
				["sku upc", 116],
				["barcode", 112],
				["ean", 108],
				["gtin", 108],
				["sku", 104],
				["item number", 96],
				["item #", 96],
				["item no", 94],
				["product code", 92],
				["stock number", 90],
				["inventory number", 88],
				["plu", 50],
			],
			description: [
				["product description", 120],
				["item description", 118],
				["description", 110],
				["product name", 100],
				["name", 70],
			],
			style: [
				["style number", 120],
				["style #", 118],
				["style", 110],
				["clu", 105],
				["model number", 95],
				["model", 80],
				["design", 70],
			],
			quantity: [
				["on hand", 120],
				["on hand qty", 118],
				["quantity", 105],
				["qty", 100],
				["count", 80],
				["total qty", 90],
				["inventory qty", 90],
			],
			price: [
				["sale price", 120],
				["sell price", 115],
				["retail price", 110],
				["price", 100],
			],
			salesFloor: [
				["sales floor", 120],
				["ats", 115],
				["available to sell", 110],
			],
			category: [
				["case code", 120],
				["casecode", 118],
				["case category", 115],
				["audit category", 112],
				["location category", 110],
				["category", 100],
				["case", 70],
				["group", 60],
			],
		};
		const list = priorities[field] || fieldAliases[field].map((a) => [a, 50]);
		let best = 0;
		for (const [term, weight] of list) {
			if (h === norm(term)) best = Math.max(best, weight);
			else if (h.includes(norm(term))) best = Math.max(best, weight - 15);
		}
		return best;
	};
	for (const f in fieldAliases) {
		let bestIndex = -1,
			bestScore = 0;
		cols.forEach((c, i) => {
			const sc = score(f, c);
			if (sc > bestScore) {
				bestScore = sc;
				bestIndex = i;
			}
		});
		out[f] = bestIndex;
	}
	return out;
}
function normalizeRows(rows) {
	return rows
		.map((r, i) => ({
			id: `row-${i}`,
			sku: String(r[mapping.sku] ?? "").trim(),
			description: String(r[mapping.description] ?? "").trim(),
			style: String(r[mapping.style] ?? "").trim(),
			quantity: Number(String(r[mapping.quantity] ?? 0).replace(/,/g, "")) || 0,
			price: Number(String(r[mapping.price] ?? 0).replace(/[$,]/g, "")) || 0,
			salesFloor:
				Number(
					String(r[mapping.salesFloor] ?? r[mapping.quantity] ?? 0).replace(
						/[$,]/g,
						"",
					),
				) || 0,
			category: String(r[mapping.category] ?? "").trim(),
			raw: r,
		}))
		.filter((x) => x.sku);
}
function rebuildInventory() {
	inventory = normalizeRows(rawRows);
	renderDashboard();
	renderBuilder();
	renderWorkspace();
}
function renderMapping() {
	const host = $("mapping-form");
	if (!columns.length) {
		host.innerHTML =
			'<div class="hint">Import a workbook to configure column mapping.</div>';
		return;
	}
	const labels = {
		sku: "UPC / scan code",
		description: "Description",
		style: "Style number / CLU",
		category: "Case code / category",
		price: "Sale price",
		quantity: "On Hand quantity",
		salesFloor: "Sales Floor quantity / ATS",
	};
	host.innerHTML = Object.entries(labels)
		.map(
			([f, label]) =>
				`<div class="field"><label for="map-${f}">${label}</label><select id="map-${f}"><option value="-1">— Not mapped —</option>${columns.map((c, i) => `<option value="${i}" ${mapping[f] === i ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>`,
		)
		.join("");
}
$("save-mapping").onclick = () => {
	if (!columns.length) return toast("Import a workbook first");
	Object.keys(mapping).forEach(
		(f) => (mapping[f] = Number($(`map-${f}`).value)),
	);
	rebuildInventory();
	$("mapping-status").textContent = "Mapping saved for this session.";
	toast("Inventory regrouped using selected columns");
};
function categories() {
	const map = new Map();
	inventory.forEach((item) => {
		const k = item.category.trim() || "(BLANK)";
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(item);
	});
	return [...map.entries()].sort((a, b) =>
		a[0] === "(BLANK)"
			? -1
			: b[0] === "(BLANK)"
				? 1
				: a[0].localeCompare(b[0], undefined, { numeric: true }),
	);
}
function renderBuilder() {
	const has = inventory.length > 0;
	$("builder-upload").style.display = has ? "none" : "block";
	$("builder-content").style.display = has ? "block" : "none";
	if (!has) return;
	const search = norm($("category-search").value);
	const cats = categories().filter(([name]) => norm(name).includes(search));
	$("category-grid").innerHTML =
		cats
			.map(
				([name, items]) =>
					`<button type="button" class="category-option ${selectedCategories.includes(name) ? "selected" : ""}" data-category="${escAttr(name)}" aria-pressed="${selectedCategories.includes(name)}"><b>${selectedCategories.includes(name) ? "✓ " : ""}${esc(name)}</b><small>${items.length} inventory row${items.length === 1 ? "" : "s"} · ${items.reduce((s, x) => s + x.quantity, 0)} units</small></button>`,
			)
			.join("") || '<div class="empty">No matching categories.</div>';
	document.querySelectorAll("[data-category]").forEach(
		(b) =>
			(b.onclick = () => {
				const name = b.dataset.category;
				selectedCategories = selectedCategories.includes(name)
					? selectedCategories.filter((x) => x !== name)
					: [...selectedCategories, name];
				selectedCategory = selectedCategories[0] || null;
				renderBuilder();
			}),
	);
	const count = selectedCategories.reduce(
		(n, name) =>
			n +
			inventory.filter((x) => (x.category.trim() || "(BLANK)") === name).length,
		0,
	);
	$("selection-summary").textContent = selectedCategories.length
		? `${selectedCategories.length} category${selectedCategories.length === 1 ? "" : "ies"} selected · ${count} reference rows`
		: "Select one or more categories to create audits.";
	$("create-audit").disabled = !selectedCategories.length;
	$("audit-name").placeholder =
		selectedCategories.length === 1
			? `${selectedCategories[0]} audit`
			: "Optional shared audit name";
}
$("category-search").addEventListener("input", renderBuilder);
function enterAuditWithLoading(id) {
	const chosen = audits.find((a) => a.id === id);
	if (!chosen) {
		toast("Select an audit first.");
		return;
	}
	if (!chosen.items?.length) {
		toast(
			"This audit has no saved inventory snapshot. Create a new audit from an imported source.",
		);
		return;
	}
	if (chosen.status === "in-progress" && !chosen.startedConfirmed) {
		const ok = confirm(
			"WARNING: Once you click Start, you will need to complete this audit to exit this screen. Continue?",
		);
		if (!ok) return;
		chosen.startedConfirmed = true;
	}
	activeAuditId = id;
	const overlay = $("audit-loading");
	const steps = [$("loading-step-1"), $("loading-step-2"), $("loading-step-3")];
	overlay.classList.add("show");
	document.querySelector(".app").classList.remove("audit-fullscreen");
	$("loading-title").textContent = "Setting up audit";
	$("loading-subtitle").textContent = "Preparing your audit workspace…";
	steps.forEach((el, i) => el.classList.toggle("active", i === 0));
	steps.forEach((el) => el.classList.remove("done"));
	setTimeout(() => {
		steps[0].classList.remove("active");
		steps[0].classList.add("done");
		steps[1].classList.add("active");
		$("loading-title").textContent = "Loading";
		$("loading-subtitle").textContent =
			"Loading inventory, scan history, and locations…";
	}, 550);
	setTimeout(() => {
		steps[1].classList.remove("active");
		steps[1].classList.add("done");
		steps[2].classList.add("active");
		$("loading-title").textContent = "Opening audit";
		$("loading-subtitle").textContent = "Entering focused full-screen mode…";
	}, 1150);
	setTimeout(() => {
		showView("audit-workspace");
		overlay.classList.remove("show");
		toast("Audit ready");
		$("sku-input").focus();
	}, 1650);
}
$("create-audit").onclick = () => {
	if (!inventory.length)
		return toast("Import inventory before creating audits.");
	if (!selectedCategories.length) return toast("Select at least one category.");
	const sharedName = $("audit-name").value.trim();
	const created = [];
	selectedCategories.forEach((category, index) => {
		const items = inventory
			.filter((x) => (x.category.trim() || "(BLANK)") === category)
			.map((x) => ({ ...x }));
		if (!items.length) return;
		const id = `audit-${Date.now()}-${index}`;
		const name = sharedName
			? selectedCategories.length === 1
				? sharedName
				: `${sharedName} — ${category}`
			: `${category} audit`;
		audits.unshift({
			id,
			name,
			category,
			items,
			sourceName: currentSourceName || "Imported inventory",
			sourceImportedAt: currentSourceImportedAt || new Date().toISOString(),
			scans: [],
			completedLocations: [],
			status: "in-progress",
			createdAt: new Date().toISOString(),
			completedAt: null,
			workedBy: "",
			auditNotes: "",
			initials: "",
			liveNotes: "",
			startedConfirmed: false,
		});
		created.push(id);
	});
	if (!created.length) return toast("No items found for those categories.");
	selectedCategories = [];
	selectedCategory = null;
	selectedDashboardAudits = [created[0]];
	renderDashboard();
	showView("dashboard");
	toast(
		`${created.length} audit${created.length === 1 ? "" : "s"} created. Select one and start when ready.`,
	);
};
function activeAudit() {
	return audits.find((a) => a.id === activeAuditId);
}
function auditProgress(a) {
	if (!a || !a.items.length) return 0;
	const expected = new Set(a.items.map((x) => x.sku));
	const checked = new Set(
		a.scans.filter((s) => expected.has(s.sku)).map((s) => s.sku),
	);
	return Math.min(100, Math.round((checked.size / expected.size) * 100));
}
function renderDashboard() {
	const closed = audits.filter((a) => a.status === "completed"),
		openAudits = audits.filter((a) => a.status !== "completed");
	$("stat-completed").textContent = closed.length;
	$("stat-progress").textContent = openAudits.length;
	$("stat-skus").textContent = inventory.length.toLocaleString();
	$("stat-scans").textContent = audits
		.reduce((n, a) => n + a.scans.length, 0)
		.toLocaleString();
	const q = norm($("audit-search").value),
		f = $("audit-filter").value;
	const list = openAudits.filter(
		(a) =>
			(!q ||
				norm(
					a.name + " " + a.category + " in progress " + (a.sourceName || ""),
				).includes(q)) &&
			(f === "all" || f === "in-progress"),
	);
	$("audit-grid").innerHTML =
		list
			.map((a) => {
				const p = auditProgress(a),
					selected = selectedDashboardAudits.includes(a.id);
				return `<article class="audit-card ${a.status === "in-progress" ? "audit-card-active" : ""} ${selected ? "audit-card-selected" : ""}"><div class="audit-card-top"><div><h3>${esc(a.name)}</h3><p>${esc(a.category)} · ${a.items.length} reference SKUs</p><p class="small-label">Source snapshot: ${esc(a.sourceName || "Original inventory")}</p></div><span class="tag progress">In progress</span></div><div class="progressline"><span class="progress-fill" data-progress="${p}"></span></div><div class="audit-meta"><span>${p}% checked · ${a.scans.length} scan entries</span><span>${a.completedLocations.length} locations</span></div><div class="audit-actions"><button class="${selected ? "primary" : "outline"}" data-select-audit="${a.id}">${selected ? "✓ Selected" : "Select audit"}</button></div></article>`;
			})
			.join("") ||
		'<div class="panel empty grid-empty"><b>No open audits</b>Import inventory and build an audit to get started.</div>';
	$("closed-audit-count").textContent = `${closed.length} closed`;
	$("closed-audit-grid").innerHTML =
		closed
			.map(
				(a) =>
					`<article class="audit-card"><div class="audit-card-top"><div><h3>${esc(a.name)}</h3><p>${esc(a.category)} · ${a.items.length} reference SKUs</p><p class="small-label">Original source: ${esc(a.sourceName || "Original inventory")}</p><p class="small-label">Closed: ${a.completedAt ? new Date(a.completedAt).toLocaleString() : "Date unavailable"}</p></div><span class="tag done">Closed</span></div><div class="progressline"><span class="progress-fill closed-progress" data-progress="${auditProgress(a)}"></span></div><div class="audit-meta"><span>${auditProgress(a)}% checked · ${a.scans.length} scan entries</span><span>${a.completedLocations.length} locations</span></div><div class="audit-actions"><button class="outline" data-view-closed="${a.id}">View audit</button><button class="outline" data-export="${a.id}">Export snapshot</button><button class="secondary" data-manager-reopen="${a.id}">Manager edit</button></div></article>`,
			)
			.join("") ||
		'<div class="panel empty grid-empty"><b>No closed audits yet</b>Completed audits will be archived here with their original inventory snapshot.</div>';
	document
		.querySelectorAll(".progress-fill[data-progress]")
		.forEach((bar) => (bar.style.width = bar.dataset.progress + "%"));
	selectedDashboardAudits = selectedDashboardAudits.filter((id) =>
		list.some((a) => a.id === id),
	);
	const bar = $("dashboard-selection-bar");
	bar.style.display = selectedDashboardAudits.length ? "flex" : "none";
	$("dashboard-selection-count").textContent =
		`${selectedDashboardAudits.length} audit${selectedDashboardAudits.length === 1 ? "" : "s"} selected`;
	document.querySelectorAll("[data-select-audit]").forEach(
		(b) =>
			(b.onclick = () => {
				const id = b.dataset.selectAudit;
				selectedDashboardAudits = selectedDashboardAudits.includes(id)
					? selectedDashboardAudits.filter((x) => x !== id)
					: [...selectedDashboardAudits, id];
				renderDashboard();
			}),
	);
	document
		.querySelectorAll("[data-export]")
		.forEach((b) => (b.onclick = () => exportAudit(b.dataset.export)));
	document
		.querySelectorAll("[data-manager-reopen]")
		.forEach(
			(b) => (b.onclick = () => managerReopenAudit(b.dataset.managerReopen)),
		);
	document
		.querySelectorAll("[data-view-closed]")
		.forEach((b) => (b.onclick = () => viewClosedAudit(b.dataset.viewClosed)));
}
function viewClosedAudit(id) {
	const a = audits.find((x) => x.id === id);
	if (!a || a.status !== "completed") return;
	activeAuditId = id;
	document.querySelector(".app").classList.remove("audit-fullscreen");
	document
		.querySelectorAll(".view")
		.forEach((v) =>
			v.classList.toggle("active", v.id === "view-audit-workspace"),
		);
	$("page-title").textContent = "Audit workspace";
	renderWorkspace();
	$("workspace-subtitle").textContent += " · Read-only history snapshot";
	$("complete-audit-btn").style.display = "none";
	$("export-btn").style.display = "inline-flex";
	$("finish-return-btn").style.display = "inline-flex";
	document
		.querySelectorAll("[data-delete-scan]")
		.forEach((b) => (b.style.display = "none"));
	window.scrollTo({ top: 0, behavior: "smooth" });
	toast("Viewing closed audit snapshot · read only");
}
function managerReopenAudit(id) {
	const original = audits.find((x) => x.id === id);
	if (!original || original.status !== "completed") return;
	const credential = prompt(
		`Manager credentials required to reopen “${original.name}”. Enter manager code:`,
	);
	if (credential === null) return;
	if (credential.trim() !== "2585") {
		toast("Manager credentials incorrect. Audit remains closed.");
		return;
	}
	if (
		!confirm(
			`Manager authorization accepted. Reopen “${original.name}” as a new revision? The original closed snapshot will remain unchanged.`,
		)
	)
		return;
	const reopenedAt = new Date().toISOString();
	const revision = {
		...original,
		id: `${original.id}-reopen-${Date.now()}`,
		name: `${original.name} — Reopened ${new Date(reopenedAt).toLocaleDateString("en-US")}`,
		items: original.items.map((x) => ({ ...x })),
		scans: original.scans.map((x) => ({ ...x })),
		completedLocations: [...original.completedLocations],
		status: "in-progress",
		createdAt: original.createdAt,
		completedAt: null,
		reopenedAt,
		startedConfirmed: false,
		revisionOf: original.id,
		workedBy: "",
		auditNotes: "",
		initials: "",
		liveNotes: "",
	};
	audits.unshift(revision);
	activeAuditId = null;
	selectedDashboardAudits = [];
	renderDashboard();
	toast(
		"New audit revision created. The original closed snapshot remains unchanged.",
	);
}
$("start-selected-audit").onclick = () => {
	if (!inventory.length)
		return toast("Import inventory before opening an audit.");
	if (selectedDashboardAudits.length !== 1) {
		toast(
			"Select exactly one audit to work on at a time. You can keep multiple audits selected for planning.",
		);
		return;
	}
	enterAuditWithLoading(selectedDashboardAudits[0]);
};
$("audit-search").addEventListener("input", renderDashboard);
$("audit-filter").addEventListener("change", renderDashboard);
function fillLocations() {
	const sel = $("location-select"),
		old = sel.value;
	sel.innerHTML =
		'<option value="">Select a location…</option>' +
		locations
			.map((l) => `<option value="${escAttr(l)}">${esc(l)}</option>`)
			.join("");
	if (locations.includes(old)) sel.value = old;
}
function currentLocation() {
	return $("location-select").value;
}
$("location-select").onchange = () => {
	updateLocationLabel();
};
function updateLocationLabel() {
	$("current-location-label").textContent = currentLocation()
		? `Scanning into location: ${currentLocation()}`
		: "Choose a location before scanning.";
}
function renderWorkspace() {
	const a = activeAudit();
	fillLocations();
	if (!a) {
		$("workspace-title").textContent = "No audit selected";
		$("workspace-subtitle").textContent =
			"Start an audit from the dashboard to begin scanning.";
		$("scan-table-body").innerHTML =
			'<tr><td colspan="9" class="empty">Your scanned items will appear here.</td></tr>';
		return;
	}
	$("workspace-title").textContent = a.name;
	$("workspace-subtitle").textContent =
		`${a.category} · ${a.items.length} reference SKUs · ${a.status === "completed" ? "Closed" : "In progress"}`;
	$("audit-initials").value = a.initials || a.workedBy || "";
	$("audit-live-notes").value = a.liveNotes || a.auditNotes || "";
	$("audit-initials").disabled = a.status === "completed";
	$("audit-live-notes").disabled = a.status === "completed";
	$("sku-input").disabled = a.status === "completed";
	$("scan-mode").disabled = a.status === "completed";
	$("scan-btn").disabled = a.status === "completed";
	$("location-select").disabled = false;
	$("complete-section-btn").disabled = a.status === "completed";
	$("section-confirm").disabled = a.status === "completed";
	$("export-btn").style.display =
		a.status === "completed" ? "inline-flex" : "none";
	const scans = a.scans;
	const rows = scans.slice().sort((x, y) => {
		const xc = a.completedLocations.includes(x.location) ? 1 : 0,
			yc = a.completedLocations.includes(y.location) ? 1 : 0;
		return xc - yc || new Date(y.timestamp || 0) - new Date(x.timestamp || 0);
	});
	$("scan-table-body").innerHTML =
		rows
			.map((s, revIndex) => {
				const i = scans.indexOf(s);
				return `<tr><td><b>${esc(s.sku)}</b></td><td>${esc(s.description || "—")}</td><td>${esc(s.style || "—")}</td><td>${s.expected === null ? "—" : s.expected}</td><td>${s.qty}</td><td>${esc(s.location)}</td><td>${esc(s.initials || "—")}</td><td><span class="status ${s.result === "Match" ? "match" : s.result === "Not in audit" ? "missing" : "unknown"}">${esc(s.result)}</span></td><td><button class="danger delete-scan-button" data-delete-scan="${i}" aria-label="Remove scan">×</button></td></tr>`;
			})
			.join("") ||
		'<tr><td colspan="9" class="empty">No scans yet. Select a location and scan your first SKU.</td></tr>';
	const mobileList = $("mobile-scan-list");
	if (mobileList) {
		mobileList.innerHTML =
			rows
				.map((s, revIndex) => {
					const i = scans.indexOf(s);
					return `<article class="scan-item-card"><div class="scan-item-head"><div><b>${esc(s.sku)}</b><div class="scan-item-description">${esc(s.description || "No description")}</div></div><span class="status ${s.result === "Match" ? "match" : s.result === "Not in audit" ? "missing" : "unknown"}">${esc(s.result)}</span></div><div class="scan-item-details"><span><small>Qty</small><b>${s.qty}</b></span><span><small>Expected</small><b>${s.expected === null ? "—" : s.expected}</b></span><span><small>Location</small><b>${esc(s.location)}</b></span></div><div class="scan-item-meta"><span>${esc(s.initials || "No initials")} · ${esc(s.style || "No style")}</span><button class="danger" data-delete-scan="${i}" aria-label="Remove scan">Remove</button></div></article>`;
				})
				.join("") ||
			'<div class="empty scan-empty">No scans yet. Select a location and scan your first SKU.</div>';
	}
	document.querySelectorAll("[data-delete-scan]").forEach((b) => {
		b.style.display = a.status === "completed" ? "none" : "";
		b.onclick = () => {
			if (a.status === "completed")
				return toast(
					"Closed audit is read-only. Manager authorization is required to edit.",
				);
			a.scans.splice(Number(b.dataset.deleteScan), 1);
			renderWorkspace();
			renderDashboard();
		};
	});
	const loc = currentLocation();
	const locScans = scans.filter((s) => s.location === loc);
	$("section-qty").textContent = locScans.reduce((n, s) => n + s.qty, 0);
	$("section-skus").textContent = new Set(locScans.map((s) => s.sku)).size;
	$("section-unknown").textContent = locScans.filter(
		(s) => s.result === "Not in audit",
	).length;
	const p = auditProgress(a);
	$("workspace-progress").textContent = p + "%";
	$("workspace-progress-bar").style.width = p + "%";
	$("workspace-reference").textContent = a.items.length;
	$("workspace-checked").textContent = new Set(
		scans.filter((s) => a.items.some((i) => i.sku === s.sku)).map((s) => s.sku),
	).size;
	$("workspace-locations").textContent = a.completedLocations.length;
	$("completed-locations").innerHTML =
		a.completedLocations
			.map((l) => `<span class="location-chip">✓ ${esc(l)}</span>`)
			.join("") || '<span class="hint">None yet</span>';
	updateLocationLabel();
	$("complete-audit-btn").style.display = "inline-flex";
	$("complete-audit-btn").textContent =
		a.status === "completed" ? "Reopen closed audit" : "Complete audit";
	$("finish-return-btn").style.display =
		a.status === "completed" ? "inline-block" : "none";
	const focusPill = document.querySelector(".audit-focus-pill");
	focusPill.classList.toggle("closed", a.status === "completed");
	focusPill.innerHTML =
		a.status === "completed"
			? "<i></i> Audit closed"
			: "<i></i> Audit in progress";
}
$("audit-initials").addEventListener("input", () => {
	const a = activeAudit();
	if (a) {
		a.initials = $("audit-initials").value.trim();
		a.workedBy = a.initials;
	}
});
$("audit-live-notes").addEventListener("input", () => {
	const a = activeAudit();
	if (a) a.liveNotes = $("audit-live-notes").value.trim();
});
function addScan() {
	const a = activeAudit();
	if (!a) return toast("Start or select an audit first");
	if (a.status === "completed")
		return toast("Reopen this audit before scanning");
	const loc = currentLocation();
	if (!loc) return toast("Choose or scan a location first");
	const sku = $("sku-input").value.trim();
	if (!sku) return toast("Scan or enter a SKU");
	const ref = a.items.find(
		(x) =>
			identifiersMatch(x.sku, sku) ||
			identifiersMatch(x.style, sku) ||
			identifiersMatch(x.upc, sku),
	);
	let qty = 1;
	if ($("scan-mode").value === "qty") {
		const val = prompt("Enter scanned quantity for " + sku, "1");
		if (val === null) return;
		qty = Number(val);
		if (!Number.isFinite(qty) || qty <= 0)
			return toast("Enter a quantity greater than zero");
	}
	const existing = a.scans.find(
		(s) =>
			identifiersMatch(s.sku, sku) &&
			s.location === loc &&
			s.result === (ref ? "Match" : "Not in audit"),
	);
	if (existing) {
		existing.qty += qty;
		existing.initials = $("audit-initials").value.trim();
	} else {
		a.scans.push({
			sku: ref?.sku || sku,
			scannedCode: sku,
			description: ref?.description || "",
			style: ref?.style || "",
			expected: ref ? ref.quantity : null,
			qty,
			location: loc,
			initials: $("audit-initials").value.trim(),
			notes: "",
			result: ref ? "Match" : "Not in audit",
			timestamp: new Date().toISOString(),
		});
	}
	$("sku-input").value = "";
	renderWorkspace();
	renderDashboard();
	$("sku-input").focus();
	toast(ref ? "SKU added to audit" : "SKU recorded: not in audit");
}
$("scan-btn").onclick = addScan;
$("sku-input").addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		addScan();
	}
});
function completeSection() {
	const a = activeAudit();
	if (!a) return toast("No active audit");
	const loc = currentLocation();
	if (!loc) return toast("Choose a location first");
	if (!a.completedLocations.includes(loc)) a.completedLocations.push(loc);
	const total = a.scans
		.filter((s) => s.location === loc)
		.reduce((n, s) => n + s.qty, 0);
	renderWorkspace();
	renderDashboard();
	toast(
		`${loc} completed · ${total} units. Select this location again to add or reorganize items if needed.`,
	);
}
$("complete-section-btn").onclick = $("section-confirm").onclick =
	completeSection;
function finalizeAudit(id) {
	const a = audits.find((x) => x.id === id);
	if (!a) return;
	const overlay = $("audit-loading");
	const steps = [$("loading-step-1"), $("loading-step-2"), $("loading-step-3")];
	overlay.classList.add("show");
	document.querySelector(".app").classList.remove("audit-fullscreen");
	$("loading-title").textContent = "Finalizing audit and exporting results";
	$("loading-subtitle").textContent =
		"Preparing the final workbook and closing this audit…";
	steps.forEach((el, i) => {
		el.classList.toggle("active", i === 0);
		el.classList.remove("done");
	});
	steps[0].querySelector("span:last-child").textContent = "Finalizing audit";
	steps[1].querySelector("span:last-child").textContent = "Exporting results";
	steps[2].querySelector("span:last-child").textContent =
		"Returning to dashboard";
	setTimeout(() => {
		steps[0].classList.remove("active");
		steps[0].classList.add("done");
		steps[1].classList.add("active");
		$("loading-subtitle").textContent = "Generating your Excel audit workbook…";
		exportAudit(id, { silent: true });
	}, 650);
	setTimeout(() => {
		steps[1].classList.remove("active");
		steps[1].classList.add("done");
		steps[2].classList.add("active");
		$("loading-subtitle").textContent = "Audit closed. Returning to dashboard…";
	}, 1250);
	setTimeout(() => {
		steps[2].classList.remove("active");
		steps[2].classList.add("done");
		overlay.classList.remove("show");
		document.querySelector(".app").classList.remove("audit-fullscreen");
		showView("dashboard");
		renderDashboard();
		toast("Audit closed and results exported");
	}, 1850);
}
$("complete-audit-btn").onclick = () => {
	const a = activeAudit();
	if (!a) return toast("No audit selected");
	if (a.status === "completed") {
		managerReopenAudit(a.id);
		return;
	}
	if (
		!confirm(
			"Are you sure you are complete? Confirm to complete this audit. Once confirmed, the audit will be finalized, exported, and closed.",
		)
	)
		return;
	a.status = "completed";
	a.completedAt = new Date().toISOString();
	a.closedSourceName = a.sourceName || "Original inventory";
	renderWorkspace();
	renderDashboard();
	finalizeAudit(a.id);
};
$("finish-return-btn").onclick = () => {
	const a = activeAudit();
	if (!a || a.status !== "completed") return;
	document.querySelector(".app").classList.remove("audit-fullscreen");
	showView("dashboard");
};
function exportAudit(id, options = {}) {
	const a = audits.find((x) => x.id === id);
	if (!a) return toast("Audit not found");
	if (a.status !== "completed")
		return toast("Export is available only after the audit is closed.");
	if (!window.XLSX)
		return toast(
			"Excel export requires an internet connection to load the workbook library",
		);
	const wb = XLSX.utils.book_new();
	const exportedAt = new Date();
	// Capture the audit handoff details once and retain them for subsequent exports.
	if (a.workedBy === undefined) a.workedBy = "";
	if (a.auditNotes === undefined) a.auditNotes = "";
	if (!options.silent) {
		const workedBy = prompt(
			"Who worked on this audit? (Names or initials)",
			a.initials || a.workedBy || "",
		);
		if (workedBy === null) return;
		a.workedBy = workedBy.trim();
		a.initials = a.workedBy;
		const auditNotes = prompt(
			"Audit notes (issues, exceptions, recounts, context)",
			a.liveNotes || a.auditNotes || "",
		);
		if (auditNotes === null) return;
		a.auditNotes = auditNotes.trim();
		a.liveNotes = a.auditNotes;
	} else {
		a.workedBy = a.initials || a.workedBy || "";
		a.auditNotes = a.liveNotes || a.auditNotes || "";
	}
	const appBanner = `BUILT BY INVENTORY AUDIT APP  |  ${a.category}  |  EXPORTED ${exportedAt.toLocaleDateString("en-US")}`;
	const scanRows = [
		[appBanner],
		[
			"Scan UPC",
			"Not in TWC",
			"Qty Scanned/On Hand",
			"Style Number",
			"Price",
			"Description",
			"Location",
			"Initials",
			"Item Notes",
		],
	];
	a.scans.forEach((s) => {
		const excelSku = String(s.sku ?? "").trim();
		// Expand quantity entries into individual UPC rows so COUNTIF-based formulas match the reference workbook.
		for (
			let unit = 0;
			unit < Math.max(1, Math.floor(Number(s.qty) || 1));
			unit++
		) {
			const r = scanRows.length + 1;
			scanRows.push([
				excelSku,
				{ f: `IF(COUNTIF(Audit!$B:$B,$A${r})>0,"-","Not in TWC")` },
				{
					f: `IF($A${r}="","",COUNTIF($A$3:$A${r},$A${r})&"/"&IFERROR(VLOOKUP($A${r},Audit!$B:$G,6,FALSE),0))`,
				},
				{
					f: `IFERROR(INDEX(Audit!$D:$D,MATCH(A${r},Audit!$B:$B,0)),"Not Found")`,
				},
				{ f: `IFERROR(INDEX(Audit!$F:$F,MATCH(A${r},Audit!$B:$B,0)),"-")` },
				{ f: `IFERROR(INDEX(Audit!$C:$C,MATCH(A${r},Audit!$B:$B,0)),"-")` },
				s.location,
				s.initials || a.initials || "",
				s.notes || "",
			]);
		}
	});
	const scanWs = XLSX.utils.aoa_to_sheet(scanRows);
	scanWs["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
	scanWs["!autofilter"] = { ref: `A2:G${Math.max(2, scanRows.length)}` };
	scanWs["!freeze"] = { xSplit: 0, ySplit: 2 };
	scanWs["!cols"] = [
		{ wch: 18 },
		{ wch: 16 },
		{ wch: 25 },
		{ wch: 22 },
		{ wch: 12 },
		{ wch: 62 },
		{ wch: 20 },
		{ wch: 12 },
		{ wch: 42 },
	];
	XLSX.utils.book_append_sheet(wb, scanWs, "Scan");
	const auditRows = [
		[appBanner],
		[
			"",
			"UPC",
			"Description",
			"Style Number",
			"Case Code",
			"Sale Price",
			"On Hand",
			"Sales Floor",
			"Scan Qty",
			"Variance",
			"Phy Qty",
			"UPC Lookup",
			"Audit Initials",
			"Audit Notes",
		],
	];
	a.items.forEach((x, i) => {
		const r = i + 3;
		const excelSku = String(x.sku ?? "").trim();
		auditRows.push([
			"",
			excelSku,
			x.description,
			x.style,
			x.category || "(BLANK)",
			x.price || 0,
			x.quantity,
			x.salesFloor,
			{ f: `IF(B${r}="","",COUNTIF(Scan!$A:$A,B${r}))` },
			{ f: `IF(B${r}="","",I${r}-G${r})` },
			null,
			{ f: `IFERROR(B${r},"")` },
			a.initials || a.workedBy || "",
			a.liveNotes || a.auditNotes || "",
		]);
	});
	const auditWs = XLSX.utils.aoa_to_sheet(auditRows);
	auditWs["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];
	auditWs["!autofilter"] = { ref: `B2:K${Math.max(2, auditRows.length)}` };
	auditWs["!freeze"] = { xSplit: 0, ySplit: 2 };
	auditWs["!cols"] = [
		{ wch: 3 },
		{ wch: 17 },
		{ wch: 62 },
		{ wch: 22 },
		{ wch: 31 },
		{ wch: 14 },
		{ wch: 10 },
		{ wch: 12 },
		{ wch: 10 },
		{ wch: 10 },
		{ wch: 10 },
		{ wch: 18 },
		{ wch: 14 },
		{ wch: 42 },
	];
	XLSX.utils.book_append_sheet(wb, auditWs, "Audit");
	// Summary worksheet documents the baseline, the final observed counts, and the handoff notes.
	const totalOnHand = a.items.reduce(
		(n, x) => n + (Number(x.quantity) || 0),
		0,
	);
	const totalSalesFloor = a.items.reduce(
		(n, x) => n + (Number(x.salesFloor) || 0),
		0,
	);
	const totalScanUnits = a.scans.reduce((n, x) => n + (Number(x.qty) || 0), 0);
	const matchedScans = a.scans
		.filter((x) => x.result !== "Not in audit")
		.reduce((n, x) => n + (Number(x.qty) || 0), 0);
	const unrecognizedScans = a.scans
		.filter((x) => x.result === "Not in audit")
		.reduce((n, x) => n + (Number(x.qty) || 0), 0);
	const uniqueScannedSkus = new Set(
		a.scans.map((x) => String(x.sku).toLowerCase()),
	).size;
	const matchedUniqueSkus = new Set(
		a.scans
			.filter((x) => x.result !== "Not in audit")
			.map((x) => String(x.sku).toLowerCase()),
	).size;
	const baselineDate = new Date(a.createdAt || exportedAt).toLocaleString(
		"en-US",
	);
	const completionDate = a.completedAt
		? new Date(a.completedAt).toLocaleString("en-US")
		: a.status === "completed"
			? exportedAt.toLocaleString("en-US")
			: "Not marked complete";
	const summaryRows = [
		["BUILT BY INVENTORY AUDIT APP  |  AUDIT SUMMARY"],
		["Audit name", a.name],
		["Category / case code", a.category],
		["Audit status", a.status === "completed" ? "Completed" : "In progress"],
		["Audit started", baselineDate],
		["Audit completed", completionDate],
		["Exported at", exportedAt.toLocaleString("en-US")],
		["Worked on by / initials", a.initials || a.workedBy || "Not provided"],
		["Locations completed", a.completedLocations.length],
		["Completed locations", a.completedLocations.join(", ") || "None"],
		[],
		["BASELINE AT START OF AUDIT"],
		["Reference SKUs at start", a.items.length],
		["Expected on-hand units at start", totalOnHand],
		["Sales-floor units from source", totalSalesFloor],
		["Original inventory source", a.sourceName || "Source name unavailable"],
		[
			"Source snapshot captured",
			a.sourceImportedAt
				? new Date(a.sourceImportedAt).toLocaleString("en-US")
				: "Timestamp unavailable",
		],
		[
			"Inventory source / note",
			"This audit uses the inventory rows captured when the audit was created. Later imports do not replace this baseline. See Audit worksheet for item-level starting quantities.",
		],
		[],
		["FINAL AUDIT COUNTS AT EXPORT"],
		["Total units recorded in scan log", totalScanUnits],
		["Units matching reference inventory", matchedScans],
		["Units marked Not in audit", unrecognizedScans],
		["Unique SKUs scanned", uniqueScannedSkus],
		["Unique recognized SKUs scanned", matchedUniqueSkus],
		[
			"Reference SKUs not yet scanned",
			Math.max(0, a.items.length - matchedUniqueSkus),
		],
		["Audit progress", auditProgress(a) + "%"],
		["Completed locations count", a.completedLocations.length],
		[],
		["AUDIT NOTES"],
		[a.auditNotes || "No notes provided."],
		[],
		["COUNTING GUIDANCE"],
		[
			"Starting on-hand and sales-floor values are the imported baseline, not a claim that every item was physically counted. Final scan totals reflect entries recorded by this app at export time. Review Scan and Audit for item-level detail and variance calculations.",
		],
	];
	const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
	summaryWs["!merges"] = [
		{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
		{ s: { r: 11, c: 0 }, e: { r: 11, c: 1 } },
		{ s: { r: 17, c: 0 }, e: { r: 17, c: 1 } },
		{ s: { r: 27, c: 0 }, e: { r: 27, c: 1 } },
		{ s: { r: 28, c: 0 }, e: { r: 28, c: 1 } },
		{ s: { r: 30, c: 0 }, e: { r: 30, c: 1 } },
		{ s: { r: 31, c: 0 }, e: { r: 31, c: 1 } },
	];
	summaryWs["!cols"] = [{ wch: 36 }, { wch: 100 }];
	XLSX.utils.book_append_sheet(wb, summaryWs, "Audit Summary");
	wb.SheetNames.unshift(wb.SheetNames.pop());
	const filename = `${a.category.replace(/[^a-z0-9]+/gi, "") || "Audit"} - ${new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }).replaceAll("/", ".")} - AO.xlsx`;
	XLSX.writeFile(wb, filename);
	toast("Audit exported with Audit Summary, Scan, and Audit worksheets");
}
$("export-btn").onclick = () => {
	if (!activeAudit()) return toast("Select an audit first");
	exportAudit(activeAuditId);
};
function renderSettings() {
	fillLocations();
	$("settings-locations").innerHTML = locations
		.map(
			(l, i) =>
				`<div class="setting-row"><span>${esc(l)}</span><div class="toolbar"><button class="outline" data-rename="${i}">Rename</button><button class="danger" data-remove="${i}">Remove</button></div></div>`,
		)
		.join("");
	document.querySelectorAll("[data-rename]").forEach(
		(b) =>
			(b.onclick = () => {
				const i = Number(b.dataset.rename),
					v = prompt("Rename location", locations[i]);
				if (v && v.trim()) {
					locations[i] = v.trim();
					renderSettings();
					fillLocations();
					toast("Location renamed");
				}
			}),
	);
	document.querySelectorAll("[data-remove]").forEach(
		(b) =>
			(b.onclick = () => {
				const i = Number(b.dataset.remove);
				if (
					confirm(
						`Remove location “${locations[i]}” from the dropdown? Existing scan history will be preserved.`,
					)
				) {
					locations.splice(i, 1);
					renderSettings();
					fillLocations();
				}
			}),
	);
	renderMapping();
}
$("add-location").onclick = () => {
	const v = $("new-location").value.trim();
	if (!v) return toast("Enter a location name");
	if (locations.some((l) => l.toLowerCase() === v.toLowerCase()))
		return toast("That location already exists");
	locations.push(v);
	$("new-location").value = "";
	renderSettings();
	fillLocations();
	toast("Location added");
};
function esc(s) {
	return String(s ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);
}
function escAttr(s) {
	return esc(s);
}
renderDashboard();
fillLocations();
renderMapping();
