/* AG Grid Community 36.2.0. All scripts and styles are served locally. */
"use strict";
const $ = (id) => document.getElementById(id);
const now = new Date();
const normalize = (v) => v.normalize("NFC").toLocaleLowerCase().replace(/\s/g, "");
const state = {token: "", template: null, templateName: "", templateDir: null, saveDir: null,
  children: [], active: 0, month: now.getMonth() + 1, year: now.getFullYear(), editing: -1};
let lessonGrid, referenceGrid, toastTimer;
const lessons = new Map();
const theme = agGrid.themeQuartz.withParams({fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12, foregroundColor: "#2b4537", backgroundColor: "#ffffff", headerBackgroundColor: "#f0f4ed",
  borderColor: "#dde5de", accentColor: "#205a46", wrapperBorderRadius: 7, rowHoverColor: "#f3f7ef"});

function element(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function toast(message, error = false) {
  clearTimeout(toastTimer); $("toast").textContent = message;
  $("toast").className = `toast${error ? " error" : ""}`; $("toast").hidden = false;
  toastTimer = setTimeout(() => $("toast").hidden = true, 6500);
}
async function request(path, body, json = false) {
  const response = await fetch(path, {method: "POST", headers: {"X-App-Token": state.token,
    "Content-Type": json ? "application/json" : "application/octet-stream"}, body: json ? JSON.stringify(body) : body});
  if (!response.ok) {
    const data = await response.json(); throw new Error(data.error || "Không thể xử lý yêu cầu.");
  }
  return response;
}
function child() {return state.children[state.active];}
function newChild() {
  const previous = state.children.at(-1);
  return {id: crypto.randomUUID(), name: "", age: previous?.age || "",
    teacher: previous?.teacher ?? state.template.defaults.teacher,
    manager: previous?.manager ?? state.template.defaults.manager,
    period: previous?.period ?? `Tháng ${state.month}/${state.year}`, lessons: []};
}
function renderTabs() {
  $("childList").replaceChildren(); $("childCount").textContent = `${state.children.length} kế hoạch`;
  state.children.forEach((c, i) => {
    const tab = element("button", undefined, `child-tab${i === state.active ? " active" : ""}`);
    tab.setAttribute("aria-current", i === state.active ? "true" : "false");
    tab.append(element("span", String(i + 1).padStart(2,"0"), "child-number"));
    const info = element("div", undefined, "child-info");
    info.append(element("span", c.name || "Học sinh mới"), element("small", `${c.lessons.length} bài học`));
    tab.append(info); tab.onclick = () => {state.active = i; renderChild();}; $("childList").append(tab);
  });
  $("childHeading").textContent = child().name || "Học sinh mới";
  $("periodHeading").textContent = `${state.month} / ${state.year}`;
  $("lessonCount").textContent = child().lessons.length;
}
function lessonOf(row) {return lessons.get(normalize(row.code || ""));}
function scoreOf(row) {return lessonOf(row)?.scores.find(s => s.id === row.scoreId);}
function rowData() {
  return child().lessons.map((row, i) => {const l = lessonOf(row); return {...row, index: i + 1,
    name: l?.name || "", objective: l?.objective || "", instruction: l?.instruction || "", criteria: scoreOf(row)?.criteria || ""};});
}
function refreshLessons() {
  lessonGrid.setGridOption("rowData", rowData());
  // Score choices depend on code, even when the scoreId is still blank.
  lessonGrid.refreshCells({force:true}); renderTabs();
  $("addLesson").disabled = child().lessons.length >= state.template.capacity;
}
function renderChild() {
  for (const field of ["name","age","teacher","manager","period"]) $(field).value = child()[field];
  refreshLessons();
}
function showLessonPicker(index) {
  state.editing = index; $("lessonSearch").value = ""; renderLessonOptions();
  $("lessonDialog").showModal(); $("lessonSearch").focus();
}
function renderLessonOptions() {
  const query = normalize($("lessonSearch").value);
  const choices = state.template.lessons.filter(l => normalize(l.code + l.name + l.objective).includes(query));
  const container = $("lessonOptions"); container.replaceChildren();
  for (const l of choices.slice(0, 150)) {
    const existing = child().lessons.findIndex((r,i) => i !== state.editing && normalize(r.code) === normalize(l.code));
    const button = element("button", undefined, "lesson-option");
    button.append(element("strong", l.code));
    const desc = element("span", l.name || "Chưa có tên bài trong tham khảo");
    const note = existing >= 0 ? `Đã chọn ở bài ${existing + 1}` : !l.scores.length ? "Chưa có thang điểm · chỉ tham khảo" : `${l.scores.length} lựa chọn điểm · hàng ${l.row}`;
    desc.append(element("small", note)); button.append(desc); button.disabled = existing >= 0 || !l.scores.length;
    button.onclick = () => {
      const row = child().lessons[state.editing];
      if (normalize(row.code) !== normalize(l.code)) row.scoreId = "";
      row.code = l.code; $("lessonDialog").close(); refreshLessons();
      showReference({code: l.code, name: l.name, objective: l.objective, instruction: l.instruction,
        row: l.row, score: l.scores.map(s => s.source).join(", "), criteria: "Chọn điểm cần đạt để xem tiêu chí tương ứng."});
    };
    container.append(button);
  }
  if (!choices.length) container.append(element("p", "Không có bài phù hợp.", "empty-note"));
  else if (choices.length > 150) container.append(element("p", "Nhập thêm để lọc các bài còn lại.", "fine"));
}
function codeRenderer(params) {
  const button = element("button", params.data.code || "Chọn bài số…", "row-code");
  button.onclick = () => showLessonPicker(params.data.index - 1); return button;
}
function scoreRenderer(params) {
  const select = element("select", undefined, "score-select");
  select.setAttribute("aria-label", `Điểm cần đạt bài ${params.data.index}`);
  select.append(new Option("Chọn điểm…", ""));
  const lesson = lessonOf(params.data);
  for (const score of lesson?.scores || []) select.append(new Option(`${score.label}${score.date_like ? " · ngày gốc" : ""}`, score.id));
  select.disabled = !lesson; select.value = params.data.scoreId;
  select.onchange = () => {
    child().lessons[params.data.index - 1].scoreId = select.value;
    refreshLessons();
    const score = scoreOf(child().lessons[params.data.index - 1]);
    if (score) showReference({code: lesson.code, name: lesson.name, objective: lesson.objective,
      instruction: lesson.instruction, score: score.source, criteria: score.criteria, row: score.row});
  };
  return select;
}
function deleteRenderer(params) {
  const button = element("button", "×", "delete-row"); button.setAttribute("aria-label", `Xóa bài ${params.data.index}`);
  button.onclick = () => {child().lessons.splice(params.data.index - 1, 1); refreshLessons();}; return button;
}
function showReference(data) {
  const target = $("referenceDetail"); target.replaceChildren();
  target.append(element("div", `Hàng ${data.row} · Ko dc xoa`, "ref-row"), element("div", `${data.code || ""} · ${data.name || "Chưa có tên bài"}`, "ref-title"));
  for (const [label,key] of [["Mục tiêu và hướng dẫn","objective"],["Thang điểm gốc","score"],["Cách chấm điểm","criteria"],["Hướng dẫn","instruction"]]) {
    target.append(element("h3", label), element("p", data[key] || "Không có nội dung trong tham khảo."));
  }
}
function createGrids() {
  lessonGrid = agGrid.createGrid($("lessonGrid"), {theme, rowHeight: 105, headerHeight: 42,
    suppressCellFocus: false, getRowId: p => p.data.id,
    overlayNoRowsTemplate: '<span class="ag-overlay-no-rows-center">Thêm bài học đầu tiên cho học sinh này.</span>',
    defaultColDef: {resizable:true, sortable:false, suppressMovable:true},
    columnDefs: [{field:"index",headerName:"#",width:45,pinned:"left"},
      {field:"code",headerName:"Bài số *",width:105,pinned:"left",cellRenderer:codeRenderer},
      {field:"scoreId",headerName:"Điểm cần đạt *",width:130,pinned:"left",cellRenderer:scoreRenderer},
      {field:"name",headerName:"Tên bài",width:210,wrapText:true},
      {field:"objective",headerName:"Mục tiêu của bài",width:250,wrapText:true},
      {field:"instruction",headerName:"Hướng dẫn",width:310,wrapText:true},
      {field:"criteria",headerName:"Tiêu chí cần đạt",width:280,wrapText:true},
      {headerName:"",width:42,pinned:"right",cellRenderer:deleteRenderer}], rowData:[]});
  referenceGrid = agGrid.createGrid($("referenceGrid"), {theme, rowHeight:65, headerHeight:38,
    defaultColDef:{resizable:true,sortable:true,editable:false},
    rowSelection:{mode:"singleRow",checkboxes:false,enableClickSelection:true},
    columnDefs:[{field:"code",headerName:"Bài số",width:92}, {field:"name",headerName:"Tên bài",width:180,wrapText:true},
      {field:"score",headerName:"Thang điểm",width:130},{field:"objective",headerName:"Mục tiêu",width:230},
      {field:"criteria",headerName:"Cách chấm điểm",width:250},{field:"instruction",headerName:"Hướng dẫn",width:270},
      {field:"row",headerName:"Hàng",width:75}],
    onRowClicked:p=>showReference(p.data), rowData:state.template.reference});
}
function validPeriod(month, year) {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 1900 && year <= 9999;
}
async function loadTemplate(file) {
  $("setupStatus").textContent = "Đang đọc workbook…";
  $("chooseFolder").disabled = true; $("loadFolderTemplate").disabled = true;
  try {
    const month = Number($("setupMonth").value), year = Number($("setupYear").value);
    if (!validPeriod(month,year)) throw new Error("Hãy chọn tháng và năm hợp lệ.");
    if (!/\.xlsx$/i.test(file.name)) throw new Error("Hãy chọn tệp .xlsx.");
    if (file.size > 30 * 1024 * 1024) throw new Error("Mẫu vượt quá giới hạn 30 MB.");
    const data = await (await request("/api/template", file)).json();
    state.template = data; state.templateName = file.name; state.month=month; state.year=year;
    lessons.clear(); data.lessons.forEach(l => lessons.set(normalize(l.code),l));
    state.children = [newChild()]; state.active = 0;
    $("welcome").hidden = true; $("workspace").hidden = false; $("export").disabled = false;
    $("templateName").textContent = `Mẫu · ${file.name}`;
    $("capacity").textContent = `Tối đa ${data.capacity} bài / học sinh`;
    $("warningsList").replaceChildren(...data.warnings.map(w=>element("li",w)));
    if (!data.warnings.length) $("warningsList").append(element("li","Không có lưu ý về dữ liệu."));
    createGrids(); renderChild();
    if (data.warnings.length) toast(`Mẫu có ${data.warnings.length} lưu ý. Xem “Lưu ý từ mẫu” trước khi nhập.`);
  } catch (err) {$("setupStatus").textContent = err.message;}
  finally {$("chooseFolder").disabled=false; $("loadFolderTemplate").disabled=false;}
}
async function chooseTemplateFolder() {
  if (!window.showDirectoryPicker) {
    $("setupStatus").textContent = "Trình duyệt này không hỗ trợ chọn thư mục. Chọn trực tiếp tệp .xlsx bên dưới."; return;
  }
  try {
    const dir = await showDirectoryPicker({id:"lesson-planner",mode:"readwrite"});
    const entries = [];
    for await (const entry of dir.values()) if (entry.kind === "file" && /\.xlsx$/i.test(entry.name) && !entry.name.startsWith("~$")) entries.push(entry);
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    if (!entries.length) throw new Error("Thư mục không có tệp .xlsx. Hãy chọn thư mục khác.");
    state.templateDir=dir; state.saveDir=dir;
    $("folderTemplate").replaceChildren(...entries.map(e=>new Option(e.name,e.name)));
    $("folderTemplateLabel").hidden=false; $("loadFolderTemplate").hidden=false;
    $("setupStatus").textContent = `Thư mục ${dir.name}. Chọn mẫu rồi nhấn “Dùng mẫu này”.`;
  } catch (err) {if (err.name !== "AbortError") $("setupStatus").textContent=err.message;}
}
function validationError() {
  for (let i=0; i<state.children.length; i++) {
    const c=state.children[i], who=c.name.trim() || `Học sinh ${i+1}`;
    if (!c.name.trim()) return {i,message:`${who}: chưa nhập họ tên.`};
    if (!c.lessons.length) return {i,message:`${who}: chưa có bài học.`};
    const used = new Set();
    for (let j=0;j<c.lessons.length;j++) {
      const row=c.lessons[j];
      if (!lessonOf(row)) return {i,message:`${who}, bài ${j+1}: chưa chọn bài số.`};
      if (!scoreOf(row)) return {i,message:`${who}, bài ${j+1}: chưa chọn điểm cần đạt.`};
      const code=normalize(row.code);
      if (used.has(code)) return {i,message:`${who}: bài ${row.code} bị lặp.`};
      used.add(code);
    }
  }
  return null;
}
function filename() {return `KeHoach_Thang${state.month}_${state.year}.xlsx`;}
function updateFilename() {
  const m=Number($("exportMonth").value), y=Number($("exportYear").value);
  $("filenamePreview").textContent = `KeHoach_Thang${m}_${y}.xlsx`;
}
function openExport() {
  const problem=validationError();
  if (problem) {state.active=problem.i;renderChild();toast(problem.message,true);return;}
  $("exportMonth").value=state.month; $("exportYear").value=state.year; updateFilename();
  $("exportSummary").textContent=`${state.children.length} học sinh · ${state.children.reduce((n,c)=>n+c.lessons.length,0)} bài học. Chỉ xuất sheet học sinh, không chứa công thức hay sheet tham khảo.`;
  $("saveLocation").textContent=state.saveDir?.name || "Chưa chọn"; $("saveStatus").textContent="";
  $("chooseSaveFolder").hidden=!window.showDirectoryPicker; $("confirmExport").disabled=!state.saveDir;
  if (!window.showDirectoryPicker) $("saveHelp").textContent="Trình duyệt này chỉ hỗ trợ tải xuống. Bật tùy chọn hỏi nơi lưu trong trình duyệt để chọn vị trí. Trình duyệt quản lý hậu tố khi tên trùng.";
  $("saveDialog").showModal();
}
async function chooseSaveFolder() {
  try {
    state.saveDir=await showDirectoryPicker({id:"lesson-planner",mode:"readwrite",...(state.saveDir||state.templateDir ? {startIn:state.saveDir||state.templateDir} : {})});
    $("saveLocation").textContent=state.saveDir.name; $("confirmExport").disabled=false;
  } catch(err) {if(err.name!=="AbortError") $("saveStatus").textContent=err.message;}
}
async function exportedBlob() {
  const m=Number($("exportMonth").value),y=Number($("exportYear").value);
  if(!validPeriod(m,y)) throw new Error("Hãy chọn tháng và năm hợp lệ.");
  const problem=validationError();if(problem) throw new Error(problem.message);
  state.month=m;state.year=y;renderTabs();
  const children=state.children.map(c=>({name:c.name,age:c.age,teacher:c.teacher,manager:c.manager,period:c.period,
    lessons:c.lessons.map(r=>({code:r.code,scoreId:r.scoreId}))}));
  return (await request("/api/export",{children},true)).blob();
}
async function availableName(dir) {
  const existing=new Set();for await(const e of dir.values()) existing.add(e.name.toLocaleLowerCase());
  let candidate=filename(),v=2;
  // Also protect the original's name if the user chose a different directory.
  existing.add(state.templateName.toLocaleLowerCase());
  while(existing.has(candidate.toLocaleLowerCase())) candidate=filename().replace(/\.xlsx$/,`_v${v++}.xlsx`);
  return candidate;
}
async function performExport(download) {
  $("confirmExport").disabled=true;$("downloadExport").disabled=true;$("saveStatus").textContent="Đang tạo workbook…";
  try {
    const blob=await exportedBlob();
    if(download) {
      const url=URL.createObjectURL(blob),a=element("a");a.href=url;a.download=filename();a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      $("saveDialog").close();toast("Workbook đã gửi tới trình duyệt để tải xuống.");
    } else {
      const dir=state.saveDir;
      if(!dir) throw new Error("Hãy chọn nơi lưu.");
      if(await dir.requestPermission({mode:"readwrite"})!=="granted") throw new Error("Chưa có quyền lưu vào thư mục này.");
      const name=await availableName(dir);
      const handle=await dir.getFileHandle(name,{create:true});
      if((await handle.getFile()).size!==0) throw new Error("Tên file vừa được dùng bởi ứng dụng khác. Nhấn lưu lại để chọn tên mới.");
      const writer=await handle.createWritable();await writer.write(blob);await writer.close();
      $("saveDialog").close();toast(`Đã lưu ${name} trong ${dir.name}.`);
    }
  } catch(err) {$("saveStatus").textContent=err.message;}
  finally {$("confirmExport").disabled=!state.saveDir;$("downloadExport").disabled=false;}
}

$("setupMonth").value=state.month;$("setupYear").value=state.year;
$("chooseFolder").onclick=chooseTemplateFolder;
$("loadFolderTemplate").onclick=async()=>{try{const h=await state.templateDir.getFileHandle($("folderTemplate").value);await loadTemplate(await h.getFile());}catch(e){$("setupStatus").textContent=e.message;}};
$("templateFile").onchange=()=>{state.templateDir=null;state.saveDir=null;const file=$("templateFile").files[0];if(file) loadTemplate(file);};
for(const f of ["name","age","teacher","manager","period"]) $(f).oninput=()=>{child()[f]=$(f).value;renderTabs();};
$("addChild").onclick=()=>{if(state.children.length>=100){toast("Tối đa 100 học sinh trong một workbook.",true);return;}state.children.push(newChild());state.active=state.children.length-1;renderChild();$("name").focus();};
$("removeChild").onclick=()=>{if(!confirm(`Xóa kế hoạch của ${child().name||"học sinh này"}?`))return;state.children.splice(state.active,1);if(!state.children.length)state.children.push(newChild());state.active=Math.min(state.active,state.children.length-1);renderChild();};
$("addLesson").onclick=()=>{child().lessons.push({id:crypto.randomUUID(),code:"",scoreId:""});refreshLessons();showLessonPicker(child().lessons.length-1);};
$("lessonSearch").oninput=renderLessonOptions;$("closeLessonDialog").onclick=()=>$("lessonDialog").close();
$("referenceSearch").oninput=()=>referenceGrid.setGridOption("quickFilterText",$("referenceSearch").value);
$("showWarnings").onclick=()=>$("warningsDialog").showModal();$("closeWarnings").onclick=()=>$("warningsDialog").close();
$("changeTemplate").onclick=()=>{if(confirm("Xóa toàn bộ kế hoạch đang nhập và chọn mẫu mới?"))location.reload();};
$("export").onclick=openExport;$("closeSave").onclick=()=>$("saveDialog").close();
$("exportMonth").oninput=updateFilename;$("exportYear").oninput=updateFilename;
$("chooseSaveFolder").onclick=chooseSaveFolder;$("confirmExport").onclick=()=>performExport(false);$("downloadExport").onclick=()=>performExport(true);
window.addEventListener("beforeunload",e=>{if(state.children.some(c=>c.name||c.lessons.length)){e.preventDefault();e.returnValue="";}});
fetch("/api/session").then(r=>r.json()).then(d=>{state.token=d.token;if(!state.token)throw new Error(d.error);}).catch(e=>{$("setupStatus").textContent=e.message;$("chooseFolder").disabled=true;$("templateFile").disabled=true;});
