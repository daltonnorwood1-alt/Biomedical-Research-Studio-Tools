import { bridge } from "./bridge.js";

const surface = document.body.dataset.surface;
const initial = bridge.initial();
const payload = initial.output?.structuredContent ?? initial.output ?? initial.input?.structuredContent ?? initial.input ?? {};
const data = payload?.data ?? payload ?? null;
const suggestedActions = Array.isArray(payload?.next_actions) ? payload.next_actions : [];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function toast(message) {
  const region = $("#toasts");
  if (!region) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  region.append(node);
  window.setTimeout(() => node.remove(), 3800);
}

function serialize(form) {
  const output = {};
  new FormData(form).forEach((value, key) => {
    if (key in output) output[key] = [output[key], value].flat();
    else output[key] = value;
  });
  return output;
}

function openLocalDialog(dialog) {
  if (dialog?.showModal) dialog.showModal();
}

function renderNextActions() {
  if (!suggestedActions.length) return;
  const host = document.querySelector("main, .card-body, .onboarding-card, .findings-pane");
  if (!host) return;
  const region = document.createElement("section");
  region.className = "next-steps";
  region.setAttribute("aria-labelledby", "recommendedNextStep");
  const heading = document.createElement("h2");
  heading.id = "recommendedNextStep";
  heading.textContent = "Recommended next step";
  const actions = document.createElement("div");
  actions.className = "toolbar";
  suggestedActions.slice(0, 3).forEach((action, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === 0 ? "button primary" : "button secondary";
    button.textContent = action.label ?? "Continue";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (action.kind === "tool" && action.tool) await bridge.callTool(action.tool, action.arguments ?? {});
        else if (action.kind === "message" && action.prompt) await bridge.sendMessage(action.prompt, action.label ?? "Continue");
        else if (action.kind === "client" && action.client_action === "select-files") (document.querySelector("#addSources, #addSourcesSecondary"))?.click();
        else if (action.kind === "client" && action.client_action === "focus-onboarding") {
          document.querySelector('.setup-step:not([hidden]) input, .setup-step:not([hidden]) select')?.focus();
          document.querySelector(".onboarding-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (error) { toast(error?.message ?? "That next step is not available yet."); }
      finally { button.disabled = false; }
    });
    actions.append(button);
  });
  region.append(heading, actions);
  host.append(region);
}

async function displayMode(mode) {
  try { await bridge.requestDisplayMode(mode); }
  catch { toast(`Could not switch to ${mode} view.`); }
}

$$('[data-display]').forEach((button) => button.addEventListener("click", () => displayMode(button.dataset.display)));
$$('[data-message]').forEach((button) => button.addEventListener("click", async () => {
  try { await bridge.sendMessage(button.dataset.message, "Continue with Research Studio"); toast("Sent to chat."); }
  catch { toast("Chat handoff is unavailable in this preview."); }
}));
$$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));

function hydrateCommon() {
  if (!data || typeof data !== "object") return;
  if (data.project?.title && $("#projectTitle")) $("#projectTitle").textContent = data.project.title;
  if (data.project?.release_status && $("#releaseStatus")) $("#releaseStatus").textContent = data.project.release_status;
}

function setupOnboarding() {
  const form = $("#onboardingForm");
  if (!form) return;
  let step = Number(bridge.getWidgetState()?.privateContent?.onboardingStep ?? 1);
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  if (projects.length) {
    $("#existingProjects").hidden = false;
    const choices = $("#existingProjectChoices");
    projects.forEach((project) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "choice-button";
      button.innerHTML = `<span class="choice-key">↗</span><span><strong></strong><br><span class="muted"></span></span><span>›</span>`;
      button.querySelector("strong").textContent = project.title ?? "Untitled project";
      button.querySelector(".muted").textContent = project.project_type ?? project.status ?? "Governed project";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await bridge.callTool("brs_complete_onboarding", { action: "open", project_id: project.id });
          await bridge.callTool("brs_render_dashboard", { project_id: project.id });
          await displayMode("fullscreen"); toast("Project opened.");
        }
        catch (error) { button.disabled = false; toast(error.message ?? "Could not open project."); }
      });
      choices.append(button);
    });
  }
  const render = () => {
    $$(".setup-step").forEach((node) => { node.hidden = Number(node.dataset.step) !== step; });
    $$(".step-dot").forEach((node, index) => node.classList.toggle("active", index + 1 === step));
    $(".stepper")?.setAttribute("aria-valuenow", String(step));
    $("#stepLabel").textContent = `Step ${step} of 3`;
    $("#backButton").hidden = step === 1;
    $("#nextButton").hidden = step === 3;
    $("#finishButton").hidden = step !== 3;
  };
  const validate = () => {
    const visible = $(`.setup-step[data-step="${step}"]`);
    const invalid = $$('input, select', visible).find((field) => !field.checkValidity());
    $("#setupError").hidden = !invalid;
    if (invalid) { $("#setupError").textContent = "Select an option to continue."; invalid.focus(); }
    return !invalid;
  };
  $("#nextButton").addEventListener("click", () => {
    if (!validate()) return;
    step += 1; render();
    bridge.setWidgetState({ modelContent: { setup: "in_progress" }, privateContent: { onboardingStep: step, values: serialize(form) } }).catch(() => {});
  });
  $("#backButton").addEventListener("click", () => { step -= 1; render(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate()) return;
    const values = serialize(form);
    const project = { title: values.title, project_type: values.project_type, article_type: values.article_type, study_design: values.study_design, target_journal: values.target_journal, author_role: values.author_role, sensitivity: values.identifiers === "no" ? "internal" : "sensitive" };
    $("#finishButton").disabled = true;
    try {
      const result = await bridge.callTool("brs_complete_onboarding", { action: "create", project });
      const projectId = result?.structuredContent?.data?.project?.id ?? result?.data?.project?.id;
      await bridge.setWidgetState({ modelContent: { setup: "complete", project_type: values.project_type }, privateContent: { onboardingStep: 3, values } });
      await bridge.updateModelContext({ project_setup: values }, `The user completed Research Studio onboarding for a ${values.project_type}.`);
      toast("Workspace created.");
      if (projectId) await bridge.callTool("brs_render_dashboard", { project_id: projectId });
      await displayMode("fullscreen");
    } catch (error) { toast(error.message ?? "Could not create the workspace."); }
    finally { $("#finishButton").disabled = false; }
  });
  render();
}

function setupDashboard() {
  if (data && typeof data === "object") {
    const project = data.project ?? data;
    if (project.title && $("#projectTitle")) $("#projectTitle").textContent = project.title;
    const sourceCount = Array.isArray(data.sources) ? data.sources.length : null;
    const findingCount = Array.isArray(data.findings) ? data.findings.filter((item) => item.status !== "resolved").length : null;
    const approvalCount = Array.isArray(data.approvals) ? data.approvals.filter((item) => item.status === "awaiting_input" || item.status === "pending").length : null;
    const metrics = $$(".metric strong");
    if (sourceCount !== null && metrics[0]) metrics[0].textContent = sourceCount;
    if (findingCount !== null && metrics[2]) metrics[2].textContent = findingCount;
    if (approvalCount !== null && metrics[3]) metrics[3].textContent = approvalCount;
    if (data.release && $("#releaseStatus")) $("#releaseStatus").textContent = data.release.releasable ? "Release approved" : "Release blocked";
  }
  $$(".nav-link[data-view]").forEach((button) => button.addEventListener("click", () => {
    $$(".nav-link[data-view]").forEach((item) => item.classList.toggle("active", item === button));
    $$(".view-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== button.dataset.view; });
    const url = new URL(location.href); url.searchParams.set("view", button.dataset.view); history.replaceState({}, "", url);
    bridge.setWidgetState({ modelContent: { active_view: button.dataset.view }, privateContent: { activeView: button.dataset.view } }).catch(() => {});
  }));
  const requested = new URLSearchParams(location.search).get("view") ?? bridge.getWidgetState()?.privateContent?.activeView;
  if (requested) $(`.nav-link[data-view="${CSS.escape(requested)}"]`)?.click();

  const openPicker = () => {
    const dialog = $("#fileDialog");
    bridge.openModal({ title: "Add project files", resourceUri: "ui://biomedical-research-studio/file-intake" }).catch(() => openLocalDialog(dialog));
  };
  $("#addSources")?.addEventListener("click", openPicker);
  $("#addSourcesSecondary")?.addEventListener("click", openPicker);
  $("#confirmSelectFiles")?.addEventListener("click", async (event) => {
    event.preventDefault();
    $("#fileDialog")?.close();
    try {
      const files = await bridge.selectFiles({ accept: [".docx", ".pdf", ".xlsx", ".csv", ".txt", ".png", ".jpg"], multiple: true });
      toast(`${files?.length ?? 0} file${files?.length === 1 ? "" : "s"} selected for privacy screening.`);
      await bridge.updateModelContext({ selected_file_count: files?.length ?? 0, intake_state: "privacy_screen_required" }, "Files were selected for governed source intake and require privacy screening.");
    } catch { toast("No files were selected."); }
  });
  $("#settingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = serialize(event.currentTarget);
    await bridge.setWidgetState({ modelContent: { preference_summary: values.answer_style }, privateContent: { settings: values, activeView: "settings" } });
    toast("Preferences saved.");
  });
  $$('[data-download]').forEach((button) => button.addEventListener("click", async () => {
    try { await bridge.downloadFile({ fileId: button.dataset.download }); }
    catch { toast("Download is available after the server returns a file ID."); }
  }));
}

function setupReview() {
  if (data && typeof data === "object" && (data.revisions?.length || data.findings?.length)) {
    const paper = $(".paper");
    const revision = data.revisions?.[0];
    if (paper && revision) {
      paper.replaceChildren();
      const label = document.createElement("p"); label.className = "eyebrow"; label.textContent = `Source context · ${revision.section ?? "manuscript"}`;
      const heading = document.createElement("h1"); heading.id = "sourceTitle"; heading.textContent = revision.section ?? "Proposed revision";
      const originalHeading = document.createElement("h2"); originalHeading.textContent = "Original";
      const original = document.createElement("p"); original.textContent = revision.original_text ?? "Original wording is unavailable.";
      const proposedHeading = document.createElement("h2"); proposedHeading.textContent = "Proposed";
      const proposed = document.createElement("p"); proposed.textContent = revision.proposed_text ?? "No proposed wording supplied.";
      paper.append(label, heading, originalHeading, original, proposedHeading, proposed);
    }
    if (Array.isArray(data.findings) && data.findings.length) {
      const pane = $(".findings-pane");
      pane.querySelectorAll(".finding").forEach((item) => item.remove());
      const title = $("#findingsTitle"); if (title) title.textContent = `${data.findings.length} finding${data.findings.length === 1 ? "" : "s"}`;
      data.findings.forEach((record) => {
        const item = record.payload ?? record;
        const article = document.createElement("article"); article.className = `finding ${item.severity === "critical" || item.severity === "major" ? "critical" : ""}`; article.dataset.finding = record.id ?? item.id ?? "finding"; article.tabIndex = 0;
        const badge = document.createElement("span"); badge.className = `badge ${item.severity === "critical" || item.severity === "major" ? "danger" : "warning"}`; badge.textContent = `${item.severity ?? "finding"} · ${item.confidence ?? "not assessed"}`;
        const heading = document.createElement("h2"); heading.style.marginTop = "10px"; heading.textContent = item.observed ?? item.rule_id ?? "Integrity finding";
        const consequence = document.createElement("p"); consequence.textContent = item.scientific_consequence ?? item.recommendation ?? "Human review required.";
        article.append(badge, heading, consequence); pane.append(article);
      });
    }
  }
  const findings = $$(".finding[data-finding]");
  let index = 0;
  const select = (nextIndex) => {
    index = (nextIndex + findings.length) % findings.length;
    findings.forEach((finding, i) => finding.classList.toggle("selected", i === index));
    const id = findings[index].dataset.finding;
    $(`#source-${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    bridge.setWidgetState({ modelContent: { selected_finding: id }, privateContent: { findingIndex: index } }).catch(() => {});
  };
  findings.forEach((finding, i) => finding.addEventListener("click", (event) => { if (!event.target.closest("button")) select(i); }));
  $("#previousFinding")?.addEventListener("click", () => select(index - 1));
  $("#nextFinding")?.addEventListener("click", () => select(index + 1));
  const requestedFinding = new URLSearchParams(location.search).get("finding");
  const requestedIndex = findings.findIndex((finding) => finding.dataset.finding === requestedFinding);
  index = requestedIndex >= 0 ? requestedIndex : Number(bridge.getWidgetState()?.privateContent?.findingIndex ?? 0); select(index);
  $$('[data-review-action="resolve"]').forEach((button) => button.addEventListener("click", () => {
    $("#resolutionId").textContent = button.dataset.id;
    $("#resolutionForm").dataset.findingId = button.dataset.id;
    openLocalDialog($("#resolutionDialog"));
  }));
  $$('[data-review-action="clarify"]').forEach((button) => button.addEventListener("click", () => bridge.sendMessage(`Ask the author to clarify finding ${button.dataset.id}. Include the observed discrepancy and the exact evidence needed.`, "Request clarification")));
  $$('[data-review-action="accept"]').forEach((button) => button.addEventListener("click", () => bridge.sendMessage(`Record that I want to accept finding ${button.dataset.id} as written. Show the evidence and scientific consequence, and ask for any required governed approval before changing records.`, "Review disposition")));
  $("#resolutionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = { finding_id: event.currentTarget.dataset.findingId, ...serialize(event.currentTarget) };
    await bridge.sendMessage(`For finding ${payload.finding_id}, I selected ${payload.authoritative_source} as the authoritative source. My rationale: ${payload.rationale}. Apply the governed review workflow and show any approval required before changing records.`, "Resolve integrity finding");
    await bridge.updateModelContext({ proposed_finding_resolution: payload }, `The user proposed a resolution for finding ${payload.finding_id}; it is not yet recorded as an approved scientific change.`);
    $("#resolutionDialog").close(); toast("Resolution sent to the governed chat workflow.");
  });
}

function setupCards() {
  const defaultCard = location.pathname.endsWith("/forms.html") ? "choice" : "approval";
  const requested = new URLSearchParams(location.search).get("card") ?? initial.input?.card ?? initial.output?.structuredContent?.card ?? defaultCard;
  $$(".card-view").forEach((card) => { card.hidden = card.dataset.card !== requested; });
  let pendingDecision = null;
  const request = data?.request ?? data;
  if (request && typeof request === "object") {
    const title = request.prompt ?? request.title ?? request.subject ?? request.exact_proposed_wording;
    const heading = $('.card-view[data-card="approval"] h1, .card-view[data-card="approval"] h2');
    if (title && heading) heading.textContent = title;
    const consequence = $('.card-view[data-card="approval"] .callout span');
    if (request.scientific_consequence && consequence) consequence.textContent = request.scientific_consequence;
  }
  $$('[data-decision]').forEach((button) => button.addEventListener("click", () => {
    pendingDecision = button.dataset.decision;
    $("#decisionTitle").textContent = `${pendingDecision.replaceAll("_", " ")} source set`;
    openLocalDialog($("#decisionDialog"));
  }));
  $("#decisionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = { request_id: request?.id ?? request?.request_id, decision: pendingDecision, ...serialize(event.currentTarget) };
    if (!payload.request_id) { toast("This approval card needs a server-issued request ID."); return; }
    await bridge.callTool("brs_submit_approval", payload);
    await bridge.updateModelContext({ latest_approval: payload }, `The user recorded a ${pendingDecision} decision for Gate B.`);
    $("#decisionDialog").close(); toast("Decision recorded with rationale.");
  });
  const requestedProperty = request?.requested_schema?.properties?.selected;
  const requestContext = request?.context ?? {};
  const dynamicOptions = requestContext.options ?? requestedProperty?.oneOf ?? requestedProperty?.items?.oneOf;
  const mode = requestContext.selection_mode ?? (requestedProperty?.type === "array" ? "multiple" : "single");
  if (Array.isArray(dynamicOptions) && dynamicOptions.length) {
    const heading = $('.card-view[data-card="choice"] h1, .card-view[data-card="choice"] h2');
    if (heading) heading.textContent = request.prompt ?? requestedProperty?.title ?? "Choose an option";
    const help = $('.card-view[data-card="choice"] .muted');
    if (help && (requestContext.help_text || requestedProperty?.description)) help.textContent = requestContext.help_text ?? requestedProperty.description;
    const stack = $('.card-view[data-card="choice"] .choice-stack');
    if (stack) {
      stack.replaceChildren(...dynamicOptions.map((option, index) => {
        const button = document.createElement("button");
        const value = option.value ?? option.const;
        button.type = "button"; button.className = "choice-button"; button.dataset.choice = value; button.setAttribute("aria-pressed", "false");
        button.innerHTML = `<span class="choice-key"></span><span><strong></strong><br><span class="muted"></span></span><span>›</span>`;
        button.querySelector(".choice-key").textContent = String.fromCharCode(65 + index);
        button.querySelector("strong").textContent = option.title ?? value;
        button.querySelector(".muted").textContent = option.description ?? "Select this option";
        return button;
      }));
    }
    const rationaleField = $("#choiceRationale");
    const note = $("#choiceNote");
    if (rationaleField && note) {
      rationaleField.hidden = !requestContext.allow_other;
      $("label", rationaleField).textContent = "Other response (optional)";
      note.placeholder = "Add context only if needed";
    }
  }
  const selectedChoices = new Set();
  $$('[data-choice]').forEach((button) => button.addEventListener("click", () => {
    if (mode === "multiple") {
      if (selectedChoices.has(button.dataset.choice)) selectedChoices.delete(button.dataset.choice); else selectedChoices.add(button.dataset.choice);
      button.setAttribute("aria-pressed", String(selectedChoices.has(button.dataset.choice)));
    } else {
      selectedChoices.clear(); selectedChoices.add(button.dataset.choice);
      $$('[data-choice]').forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    }
    if ($("#choiceRationale")) $("#choiceRationale").hidden = !(requestContext.allow_other || !Array.isArray(dynamicOptions));
    $("#confirmChoice").disabled = selectedChoices.size === 0;
  }));
  $("#confirmChoice")?.addEventListener("click", async () => {
    const other = $("#choiceNote")?.value.trim() || undefined;
    const requestId = request?.id ?? request?.request_id;
    if (!requestId) { toast("This choice form needs a server-issued request ID."); return; }
    const selected = mode === "multiple" ? [...selectedChoices] : [...selectedChoices][0];
    await bridge.callTool("brs_submit_selectable_response", { request_id: requestId, selected, ...(other ? { other } : {}) });
    await bridge.updateModelContext({ selectable_response: selected }, `The user submitted a response to ${request.prompt ?? "a selectable question"}.`);
    toast("Selection recorded.");
  });
  $("[data-open-review]")?.addEventListener("click", () => { location.href = "./review.html?finding=F-014"; });
}

function setupEvidence() {
  const claims = Array.isArray(data?.claims) ? data.claims : [];
  const literature = Array.isArray(data?.literature) ? data.literature : [];
  const passages = Array.isArray(data?.passages) ? data.passages : [];
  const links = Array.isArray(data?.links) ? data.links : [];
  const health = Array.isArray(data?.citation_health) ? data.citation_health : [];
  let selectedClaim = null;
  let selectedPassage = null;
  if ($("#claimCount")) $("#claimCount").textContent = String(claims.length);
  if ($("#sourceCount")) $("#sourceCount").textContent = String(literature.length);
  if ($("#linkCount")) $("#linkCount").textContent = String(links.length);
  const claimList = $("#claimList");
  if (claimList && claims.length) {
    claimList.replaceChildren(...claims.map((claim) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "select-item"; button.setAttribute("aria-pressed", "false");
      const text = document.createElement("strong"); text.textContent = claim.claim_text;
      const meta = document.createElement("small"); meta.textContent = `${claim.claim_type} · paragraph ${claim.location?.paragraph ?? "?"} · ${claim.evidence_status}`;
      button.append(text, meta); button.addEventListener("click", () => {
        selectedClaim = claim.id; $$("#claimList .select-item").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); renderLinkControls();
      }); return button;
    }));
  }
  const literatureList = $("#literatureList");
  if (literatureList && literature.length) {
    const nodes = [];
    literature.forEach((record) => {
      const article = document.createElement("article"); article.className = "card";
      const title = document.createElement("h3"); title.textContent = record.title;
      const meta = document.createElement("p"); meta.className = "muted"; meta.textContent = `PubMed ${record.pmid ?? record.provider_id}${record.doi ? ` · DOI ${record.doi}` : ""}`;
      const alert = health.find((item) => item.literature_record_id === record.id && item.status === "alert");
      article.append(title, meta);
      if (alert) { const badge = document.createElement("span"); badge.className = "badge danger"; badge.textContent = "Citation alert"; article.append(badge); }
      passages.filter((passage) => passage.literature_record_id === record.id).forEach((passage) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "select-item"; button.setAttribute("aria-pressed", "false");
        const quote = document.createElement("strong"); quote.textContent = passage.passage_text;
        const where = document.createElement("small"); where.textContent = `${passage.verification_status} · ${passage.support_status}`;
        button.append(quote, where); button.addEventListener("click", () => {
          selectedPassage = passage.id; $$("#literatureList .select-item").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); renderLinkControls();
        }); article.append(button);
      }); nodes.push(article);
    }); literatureList.replaceChildren(...nodes);
  }
  const renderLinkControls = () => {
    const host = $("#linkList"); if (!host) return;
    if (!selectedClaim || !selectedPassage) { host.innerHTML = "<p class=\"muted\">Select one claim and one exact passage.</p>"; return; }
    const text = document.createElement("p"); text.textContent = "How does this exact passage relate to the selected claim?";
    const actions = document.createElement("div"); actions.className = "card-actions";
    [["supports", "Supports"], ["contradicts", "Contradicts"], ["contextualizes", "Adds context"]].forEach(([relation, label]) => {
      const button = document.createElement("button"); button.type = "button"; button.className = relation === "supports" ? "button primary" : "button"; button.textContent = label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await bridge.callTool("brs_propose_claim_evidence_link", { project_id: data.project_id, claim_id: selectedClaim, passage_id: selectedPassage, relation }); toast("Proposed link recorded for Gate B review."); }
        catch (error) { toast(error?.message ?? "Could not propose the link."); }
        finally { button.disabled = false; }
      }); actions.append(button);
    }); host.replaceChildren(text, actions);
  };
  $("#searchPubmed")?.addEventListener("click", () => openLocalDialog($("#searchDialog")));
  $("#pubmedForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = serialize(event.currentTarget);
    try { await bridge.callTool("brs_search_pubmed", { project_id: data.project_id, query: form.query, limit: Number(form.limit) }); $("#searchDialog")?.close(); toast("PubMed search complete. Results were saved to the evidence ledger."); }
    catch (error) { toast(error?.message ?? "PubMed search failed."); }
  });
}

hydrateCommon();
if (surface === "onboarding") setupOnboarding();
if (surface === "dashboard") setupDashboard();
if (surface === "review") setupReview();
if (surface === "cards") setupCards();
if (surface === "evidence") setupEvidence();
renderNextActions();

bridge.on("toolresult", (result) => {
  if (result?.structuredContent?.message) toast(result.structuredContent.message);
});
bridge.on("hostcontextchanged", (context) => {
  if (context?.theme) document.documentElement.dataset.theme = context.theme;
});
