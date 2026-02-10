export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agora</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

  .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-bottom: 1px solid #334155; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
  .header h1 { font-size: 22px; font-weight: 600; color: #f1f5f9; cursor: pointer; user-select: none; }
  .header h1 span { color: #38bdf8; }
  .header h1:hover { opacity: 0.85; }
  .header-right { display: flex; align-items: center; gap: 16px; }
  .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; display: inline-block; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .status-text { font-size: 13px; color: #94a3b8; }
  .refresh-info { font-size: 12px; color: #64748b; }

  .container { max-width: 1360px; margin: 0 auto; padding: 24px; }

  .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 28px; }
  .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
  .stat-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px; }
  .stat-value { font-size: 32px; font-weight: 700; }
  .stat-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .stat-card.blue .stat-value { color: #38bdf8; }
  .stat-card.green .stat-value { color: #22c55e; }
  .stat-card.amber .stat-value { color: #f59e0b; }
  .stat-card.purple .stat-value { color: #a78bfa; }

  .section { margin-bottom: 28px; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .section-title { font-size: 16px; font-weight: 600; color: #cbd5e1; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
  .badge-online { background: #052e16; color: #4ade80; }
  .badge-offline { background: #1c1917; color: #78716c; }
  .badge-registered { background: #172554; color: #60a5fa; }
  .badge-committed { background: #312e81; color: #a78bfa; }
  .badge-approving { background: #422006; color: #fbbf24; }
  .badge-accepted { background: #164e63; color: #22d3ee; }
  .badge-planning { background: #4a1d96; color: #c084fc; }
  .badge-ready { background: #172554; color: #60a5fa; }
  .badge-executing { background: #422006; color: #fbbf24; }
  .badge-completed { background: #052e16; color: #4ade80; }
  .badge-failed { background: #450a0a; color: #f87171; }
  .badge-in_progress { background: #422006; color: #fbbf24; }
  .badge-created { background: #1e1b4b; color: #a78bfa; }
  .badge-pending { background: #1e1b4b; color: #a78bfa; }
  .badge-assigned { background: #172554; color: #60a5fa; }
  .badge-expired { background: #451a03; color: #fb923c; }

  .pbar-wrap { background: #0f172a; border-radius: 8px; height: 8px; overflow: hidden; }
  .pbar-fill { height: 100%; border-radius: 8px; transition: width 0.6s ease; background: linear-gradient(90deg,#38bdf8,#22c55e); }

  .agents-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(280px,1fr)); gap: 12px; }
  .agent-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px; display: flex; align-items: center; gap: 14px; }
  .agent-avatar { width: 40px; height: 40px; border-radius: 10px; background: #334155; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .agent-info { flex: 1; min-width: 0; }
  .agent-name { font-size: 14px; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .agent-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
  .agent-id-text { font-family: monospace; font-size: 10px; color: #475569; margin-top: 2px; }

  .job-row { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px 22px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; display: flex; align-items: center; gap: 20px; }
  .job-row:hover { border-color: #38bdf8; box-shadow: 0 0 0 1px rgba(56,189,248,0.15); }
  .job-row-main { flex: 1; min-width: 0; }
  .job-row-name { font-size: 15px; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .job-row-sub { font-size: 12px; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .job-row-progress { width: 180px; flex-shrink: 0; }
  .job-row-pct { font-size: 12px; color: #94a3b8; text-align: right; margin-bottom: 4px; }
  .job-row-badge { flex-shrink: 0; }
  .job-row-arrow { color: #475569; font-size: 18px; flex-shrink: 0; margin-left: 8px; }

  /* Approval cards on home page */
  .appr-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px 22px; margin-bottom: 10px; }
  .appr-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
  .appr-name { font-size: 15px; font-weight: 600; color: #f1f5f9; }
  .appr-desc { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  .appr-prog { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .appr-prog-text { font-size: 13px; color: #fbbf24; font-weight: 600; white-space: nowrap; }
  .appr-form { display: flex; gap: 8px; align-items: center; }
  .appr-input { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 13px; width: 220px; outline: none; }
  .appr-input:focus { border-color: #38bdf8; }
  .appr-btn { background: #f59e0b; color: #0f172a; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
  .appr-btn:hover { background: #fbbf24; }
  .appr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .appr-msg { font-size: 12px; margin-top: 8px; min-height: 18px; }
  .appr-msg.ok { color: #4ade80; }
  .appr-msg.err { color: #f87171; }

  .breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 13px; }
  .bc-link { color: #38bdf8; text-decoration: none; cursor: pointer; }
  .bc-link:hover { text-decoration: underline; }
  .bc-sep { color: #475569; }
  .bc-cur { color: #94a3b8; }

  .d-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  .d-title { font-size: 20px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; }
  .d-desc { font-size: 14px; color: #94a3b8; margin-bottom: 16px; }
  .d-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(200px,1fr)); gap: 16px; }
  .d-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
  .d-val { font-size: 14px; color: #e2e8f0; word-break: break-all; }
  .d-val.mono { font-family: monospace; font-size: 12px; color: #94a3b8; }

  /* DAG Flow */
  .dag { display: flex; align-items: center; gap: 0; padding: 16px 0; overflow-x: auto; margin-bottom: 20px; }
  .dag-node { display: flex; flex-direction: column; align-items: center; min-width: 100px; position: relative; }
  .dag-circle { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; border: 3px solid transparent; transition: all 0.3s; }
  .dag-circle.past { background: #1e40af; border-color: #3b82f6; color: #93c5fd; }
  .dag-circle.current { background: #92400e; border-color: #f59e0b; color: #fef3c7; animation: dagPulse 2s infinite; }
  .dag-circle.future { background: #1e293b; border-color: #334155; color: #475569; }
  .dag-circle.failed { background: #7f1d1d; border-color: #ef4444; color: #fca5a5; }
  @keyframes dagPulse { 0%,100%{ box-shadow: 0 0 0 0 rgba(245,158,11,0.4); } 50%{ box-shadow: 0 0 0 8px rgba(245,158,11,0); } }
  .dag-label { font-size: 11px; color: #94a3b8; margin-top: 6px; text-align: center; white-space: nowrap; }
  .dag-label.current { color: #fbbf24; font-weight: 600; }
  .dag-label.past { color: #60a5fa; }
  .dag-time { font-size: 10px; color: #475569; margin-top: 2px; text-align: center; }
  .dag-edge { width: 40px; height: 3px; background: #334155; flex-shrink: 0; }
  .dag-edge.past { background: #3b82f6; }
  .dag-badge { font-size: 10px; background: #f59e0b; color: #0f172a; border-radius: 9999px; padding: 0 6px; font-weight: 700; margin-top: 3px; }

  .tk-card { background: #0f172a; border: 1px solid #334155; border-radius: 10px; margin-bottom: 10px; overflow: hidden; transition: border-color 0.2s; }
  .tk-card:hover { border-color: #475569; }
  .tk-hdr { padding: 14px 18px; display: flex; align-items: center; gap: 14px; cursor: pointer; }
  .tk-hdr:hover { background: rgba(30,41,59,0.4); }
  .tk-idx { font-size: 13px; font-weight: 700; color: #38bdf8; width: 32px; text-align: center; flex-shrink: 0; }
  .tk-main { flex: 1; min-width: 0; }
  .tk-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .tk-agent { font-size: 12px; color: #64748b; }
  .tk-times { font-size: 11px; color: #475569; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap; }
  .tk-prog { width: 120px; flex-shrink: 0; text-align: right; }
  .tk-pct { font-size: 12px; color: #94a3b8; margin-bottom: 3px; }
  .tk-arrow { color: #475569; font-size: 16px; flex-shrink: 0; transition: transform 0.2s; }
  .tk-arrow.open { transform: rotate(90deg); }
  .tk-type { font-size: 10px; background: #4a1d96; color: #c084fc; padding: 1px 6px; border-radius: 4px; font-weight: 600; }

  .tk-body { border-top: 1px solid #1e293b; padding: 18px; display: none; }
  .tk-body.open { display: block; }

  .jv { background: #0c0f1a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; font-family: 'SF Mono','Fira Code',monospace; font-size: 12px; line-height: 1.6; color: #94a3b8; max-height: 400px; overflow: auto; white-space: pre-wrap; word-break: break-all; margin-bottom: 14px; }
  .jv-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }

  .tl { position: relative; padding-left: 28px; }
  .tl::before { content: ''; position: absolute; left: 8px; top: 4px; bottom: 4px; width: 2px; background: #334155; }
  .tl-item { position: relative; margin-bottom: 14px; }
  .tl-dot { position: absolute; left: -24px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #334155; border: 2px solid #0f172a; }
  .tl-dot.assigned { background: #60a5fa; }
  .tl-dot.started { background: #fbbf24; }
  .tl-dot.progress { background: #38bdf8; }
  .tl-dot.completed { background: #4ade80; }
  .tl-dot.failed { background: #f87171; }
  .tl-dot.retried { background: #fb923c; }
  .tl-dot.expired { background: #fb923c; }
  .tl-dot.created { background: #a78bfa; }
  .tl-ev { font-size: 13px; color: #e2e8f0; }
  .tl-time { font-size: 11px; color: #475569; margin-top: 2px; }
  .tl-det { font-size: 11px; color: #64748b; margin-top: 2px; }

  .empty { text-align: center; padding: 48px 20px; color: #475569; }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; }

  .dur-chip { display: inline-block; background: #334155; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: #94a3b8; font-family: monospace; }

  @media (max-width: 768px) {
    .stats { grid-template-columns: repeat(2,1fr); }
    .agents-grid { grid-template-columns: 1fr; }
    .container { padding: 16px; }
    .job-row { flex-wrap: wrap; }
    .job-row-progress { width: 100%; }
    .d-grid { grid-template-columns: 1fr; }
    .dag { flex-wrap: wrap; justify-content: center; }
  }
</style>
</head>
<body>

<div class="header">
  <h1 id="logoLink"><span>&#9670;</span> Agora</h1>
  <div class="header-right">
    <span class="status-dot"></span>
    <span class="status-text" id="healthStatus">Connecting...</span>
    <span class="refresh-info">Auto-refresh 5s</span>
  </div>
</div>

<div class="container">
  <div id="page-home">
    <div class="stats" id="statsCards">
      <div class="stat-card blue"><div class="stat-label">Agents</div><div class="stat-value" id="sA">-</div><div class="stat-sub" id="sAS"></div></div>
      <div class="stat-card green"><div class="stat-label">Jobs</div><div class="stat-value" id="sJ">-</div><div class="stat-sub" id="sJS"></div></div>
      <div class="stat-card amber"><div class="stat-label">Tasks</div><div class="stat-value" id="sT">-</div><div class="stat-sub" id="sTS"></div></div>
      <div class="stat-card purple"><div class="stat-label">Completed</div><div class="stat-value" id="sC">-</div><div class="stat-sub" id="sCS"></div></div>
    </div>
    <div class="section" id="pendingApprovalSection" style="display:none">
      <div class="section-header"><div class="section-title">Pending Approval</div></div>
      <div id="pendingApprovalList"></div>
    </div>
    <div class="section">
      <div class="section-header"><div class="section-title">Agents</div></div>
      <div class="agents-grid" id="agentsList"></div>
    </div>
    <div class="section">
      <div class="section-header"><div class="section-title">Jobs</div></div>
      <div id="jobsList"></div>
    </div>
  </div>
  <div id="page-detail" style="display:none"></div>
</div>

<script>
(function(){
  var API='', curPage='home', curJobId=null;

  function B(s){return '<span class="badge badge-'+(s||'')+'">'+(s||'').replace(/_/g,' ')+'</span>';}
  function TA(ts){
    if(!ts)return'-';
    var d=new Date(ts.indexOf('T')>=0?ts:ts+'Z');
    var s=Math.floor((Date.now()-d.getTime())/1000);
    if(s<0)return'just now';if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';
  }
  function FT(ts){
    if(!ts)return'-';
    var d=new Date(ts.indexOf('T')>=0?ts:ts+'Z');
    return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  function DUR(f,t){
    if(!f)return'-';
    var s1=new Date(f.indexOf('T')>=0?f:f+'Z').getTime();
    var s2=t?new Date(t.indexOf('T')>=0?t:t+'Z').getTime():Date.now();
    var sec=Math.floor((s2-s1)/1000);
    if(sec<0)sec=0;
    if(sec<60)return sec+'s';if(sec<3600)return Math.floor(sec/60)+'m '+sec%60+'s';
    return Math.floor(sec/3600)+'h '+Math.floor((sec%3600)/60)+'m';
  }
  function SI(id){return id?id.substring(0,8):'-';}
  function E(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function PJ(o){try{if(typeof o==='string')o=JSON.parse(o);return E(JSON.stringify(o,null,2));}catch(e){return E(String(o));}}

  async function F(p,opt){try{var r=await fetch(API+p,opt);var j=await r.json();return j;}catch(e){return null;}}

  function nav(page,id){
    curPage=page;curJobId=id||null;
    document.getElementById('page-home').style.display=page==='home'?'block':'none';
    document.getElementById('page-detail').style.display=page==='detail'?'block':'none';
    if(page==='detail')document.getElementById('page-detail').innerHTML='<div style="padding:40px;text-align:center;color:#64748b">Loading...</div>';
    doRefresh();
  }
  window._nav=nav;

  document.getElementById('logoLink').onclick=function(){nav('home');};

  // Approve job from home page
  window._approveJob=async function(jobId){
    var inp=document.getElementById('appr-input-'+jobId);
    var msg=document.getElementById('appr-msg-'+jobId);
    var btn=document.getElementById('appr-btn-'+jobId);
    if(!inp||!msg||!btn)return;
    var agentId=inp.value.trim();
    if(!agentId){msg.className='appr-msg err';msg.textContent='Please enter an Agent ID';return;}
    btn.disabled=true;msg.textContent='Submitting...';msg.className='appr-msg';
    var res=await F('/api/jobs/'+jobId+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agent_id:agentId})});
    if(res&&res.success){
      msg.className='appr-msg ok';msg.textContent='Approved successfully!';
      inp.value='';
      setTimeout(function(){doRefresh();},800);
    } else {
      msg.className='appr-msg err';
      msg.textContent=(res&&res.error)?res.error.message:'Failed to approve';
    }
    btn.disabled=false;
  };

  // Approve job from detail page
  window._approveJobDetail=async function(jobId){
    var inp=document.getElementById('dappr-input');
    var msg=document.getElementById('dappr-msg');
    var btn=document.getElementById('dappr-btn');
    if(!inp||!msg||!btn)return;
    var agentId=inp.value.trim();
    if(!agentId){msg.className='appr-msg err';msg.textContent='Please enter an Agent ID';return;}
    btn.disabled=true;msg.textContent='Submitting...';msg.className='appr-msg';
    var res=await F('/api/jobs/'+jobId+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agent_id:agentId})});
    if(res&&res.success){
      msg.className='appr-msg ok';msg.textContent='Approved successfully!';
      inp.value='';
      setTimeout(function(){doRefresh();},800);
    } else {
      msg.className='appr-msg err';
      msg.textContent=(res&&res.error)?res.error.message:'Failed to approve';
    }
    btn.disabled=false;
  };

  async function refreshHome(){
    var statsResp=await F('/api/stats');
    var stats=statsResp&&statsResp.success?statsResp.data||statsResp:statsResp;
    if(stats){
      document.getElementById('sA').textContent=stats.agents?stats.agents.total:'-';
      document.getElementById('sAS').textContent=(stats.agents?stats.agents.online:0)+' online';
      document.getElementById('sJ').textContent=stats.jobs?stats.jobs.total:'-';
      var js=stats.jobs?Object.entries(stats.jobs.by_status||{}).map(function(e){return e[0]+': '+e[1];}).join(', '):'';
      document.getElementById('sJS').textContent=js||'none';
      document.getElementById('sT').textContent=stats.tasks?stats.tasks.total:'-';
      var ts=stats.tasks?Object.entries(stats.tasks.by_status||{}).map(function(e){return e[0]+': '+e[1];}).join(', '):'';
      document.getElementById('sTS').textContent=ts||'none';
      var c=(stats.tasks&&stats.tasks.by_status)?stats.tasks.by_status.completed||0:0;
      document.getElementById('sC').textContent=c;
      var p=stats.tasks&&stats.tasks.total>0?Math.round(c/stats.tasks.total*100):0;
      document.getElementById('sCS').textContent=p+'% of all tasks';
    }

    var agentsResp=await F('/api/agents');
    var agents=(agentsResp&&agentsResp.success)?agentsResp.data:agentsResp;
    var ae=document.getElementById('agentsList');
    if(agents&&agents.length>0){
      ae.innerHTML=agents.map(function(a){
        var ic=a.status==='online'?'&#128994;':'&#9899;';
        return '<div class="agent-card"><div class="agent-avatar">'+ic+'</div><div class="agent-info">'
          +'<div class="agent-name">'+E(a.name)+'</div>'
          +'<div class="agent-meta">'+B(a.status)+' &middot; v'+E(a.version||'?')+' &middot; heartbeat '+TA(a.last_heartbeat)+'</div>'
          +'<div class="agent-id-text">'+a.id+'</div></div></div>';
      }).join('');
    } else {
      ae.innerHTML='<div class="empty"><div class="empty-icon">&#129302;</div><div class="empty-text">No agents registered</div></div>';
    }

    var jobsResp=await F('/api/jobs');
    var jobs=(jobsResp&&jobsResp.success)?jobsResp.data:jobsResp;

    // Pending approval section
    var pendingJobs=jobs?jobs.filter(function(j){return j.status==='committed'||j.status==='approving';}):[];
    var pas=document.getElementById('pendingApprovalSection');
    var pal=document.getElementById('pendingApprovalList');
    if(pendingJobs.length>0){
      pas.style.display='block';
      pal.innerHTML=pendingJobs.map(function(j){
        var cnt=j.approval_count||0;
        var req=j.required_approvals||5;
        var pct=Math.round(cnt/req*100);
        return '<div class="appr-card">'
          +'<div class="appr-top"><div><div class="appr-name">'+E(j.name)+' <span style="cursor:pointer;color:#38bdf8;font-size:12px" onclick="_nav(\\'detail\\',\\''+j.id+'\\')">[detail]</span></div>'
          +(j.description?'<div class="appr-desc">'+E(j.description)+'</div>':'')
          +'</div><div>'+B(j.status)+'</div></div>'
          +'<div class="appr-prog">'
          +'<div class="appr-prog-text">'+cnt+' / '+req+' approvals</div>'
          +'<div class="pbar-wrap" style="flex:1"><div class="pbar-fill" style="width:'+pct+'%;background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div></div>'
          +'</div>'
          +'<div class="appr-form">'
          +'<input class="appr-input" id="appr-input-'+j.id+'" placeholder="Enter Agent ID to approve" />'
          +'<button class="appr-btn" id="appr-btn-'+j.id+'" onclick="_approveJob(\\''+j.id+'\\')">Approve</button>'
          +'</div>'
          +'<div class="appr-msg" id="appr-msg-'+j.id+'"></div>'
          +'</div>';
      }).join('');
    } else {
      pas.style.display='none';
    }

    var je=document.getElementById('jobsList');
    if(jobs&&jobs.length>0){
      je.innerHTML=jobs.map(function(j){
        var p=j.total_tasks>0?Math.round(j.completed_tasks/j.total_tasks*100):0;
        var approvalInfo='';
        if(j.status==='committed'||j.status==='approving'){
          approvalInfo='<span style="color:#fbbf24">'+(j.approval_count||0)+'/'+(j.required_approvals||5)+' approvals</span>';
        }
        return '<div class="job-row" onclick="_nav(\\'detail\\',\\''+j.id+'\\')">'
          +'<div class="job-row-main"><div class="job-row-name">'+E(j.name)+'</div>'
          +'<div class="job-row-sub">'
          +'<span style="font-family:monospace;font-size:11px;color:#475569">'+SI(j.id)+'</span>'
          +(j.description?'<span>'+E(j.description)+'</span>':'')
          +(j.total_tasks>0?'<span>'+j.completed_tasks+'/'+j.total_tasks+' tasks</span>':'')
          +approvalInfo
          +'<span>'+TA(j.created_at)+'</span></div></div>'
          +'<div class="job-row-progress"><div class="job-row-pct">'+p+'%</div>'
          +'<div class="pbar-wrap"><div class="pbar-fill" style="width:'+p+'%"></div></div></div>'
          +'<div class="job-row-badge">'+B(j.status)+'</div>'
          +'<div class="job-row-arrow">&#8250;</div></div>';
      }).join('');
    } else {
      je.innerHTML='<div class="empty"><div class="empty-icon">&#128203;</div><div class="empty-text">No jobs submitted yet</div></div>';
    }
  }

  async function refreshDetail(){
    if(!curJobId)return;
    var el=document.getElementById('page-detail');

    // Save expanded task IDs before rebuilding
    var expanded=[];
    el.querySelectorAll('.tk-body.open').forEach(function(b){
      var tid=b.id.replace('bd-','');
      expanded.push(tid);
    });

    var jobResp=await F('/api/jobs/'+curJobId);
    var job=(jobResp&&jobResp.success)?jobResp.data:jobResp;
    var tasksResp=await F('/api/jobs/'+curJobId+'/tasks');
    var tasks=(tasksResp&&tasksResp.success)?tasksResp.data:tasksResp;
    var agentsResp=await F('/api/agents');
    var agents=(agentsResp&&agentsResp.success)?agentsResp.data:agentsResp;
    var eventsResp=await F('/api/jobs/'+curJobId+'/events');
    var events=(eventsResp&&eventsResp.success)?eventsResp.data:eventsResp;

    if(!job){el.innerHTML='<div class="empty"><div class="empty-text">Job not found</div></div>';return;}

    var am={};if(agents)agents.forEach(function(a){am[a.id]=a;});
    var pct=job.total_tasks>0?Math.round(job.completed_tasks/job.total_tasks*100):0;
    var h='';

    // Breadcrumb
    h+='<div class="breadcrumb"><a class="bc-link" onclick="_nav(\\'home\\')">Home</a><span class="bc-sep">&#8250;</span><span class="bc-cur">'+E(job.name)+'</span></div>';

    // DAG Flow Chart
    h+=buildDAG(job, events);

    // Approval panel (for committed/approving jobs)
    if(job.status==='committed'||job.status==='approving'){
      h+='<div class="d-card" style="border-color:#f59e0b30">';
      h+='<div style="font-size:15px;font-weight:600;color:#fbbf24;margin-bottom:12px">Approval Required</div>';
      h+='<div class="appr-prog" style="margin-bottom:12px">';
      h+='<div class="appr-prog-text">'+(job.approval_count||0)+' / '+(job.required_approvals||5)+' approvals</div>';
      var apct=Math.round((job.approval_count||0)/(job.required_approvals||5)*100);
      h+='<div class="pbar-wrap" style="flex:1"><div class="pbar-fill" style="width:'+apct+'%;background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div></div>';
      h+='</div>';
      h+='<div class="appr-form">';
      h+='<input class="appr-input" id="dappr-input" placeholder="Enter Agent ID to approve" />';
      h+='<button class="appr-btn" id="dappr-btn" onclick="_approveJobDetail(\\''+job.id+'\\')">Approve</button>';
      h+='</div>';
      h+='<div class="appr-msg" id="dappr-msg"></div>';
      h+='</div>';
    }

    // Job info
    h+='<div class="d-card">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">';
    h+='<div><div class="d-title">'+E(job.name)+'</div>';
    if(job.description)h+='<div class="d-desc">'+E(job.description)+'</div>';
    h+='</div><div>'+B(job.status)+'</div></div>';

    if(job.total_tasks>0){
      h+='<div style="margin-bottom:18px">';
      h+='<div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-bottom:6px">';
      h+='<span>'+job.completed_tasks+' / '+job.total_tasks+' tasks</span><span>'+pct+'%</span></div>';
      h+='<div class="pbar-wrap"><div class="pbar-fill" style="width:'+pct+'%"></div></div></div>';
    }

    h+='<div class="d-grid">';
    h+='<div><div class="d-label">Job ID</div><div class="d-val mono">'+job.id+'</div></div>';
    h+='<div><div class="d-label">Created By</div><div class="d-val">'+(job.created_by?E(job.created_by):'<span style="color:#475569">API</span>')+'</div></div>';
    h+='<div><div class="d-label">Created</div><div class="d-val">'+FT(job.created_at)+'</div></div>';
    h+='<div><div class="d-label">Started</div><div class="d-val">'+FT(job.started_at)+'</div></div>';
    h+='<div><div class="d-label">Completed</div><div class="d-val">'+FT(job.completed_at)+'</div></div>';
    h+='<div><div class="d-label">Duration</div><div class="d-val">'+DUR(job.started_at,job.completed_at)+'</div></div>';
    h+='<div><div class="d-label">Approvals</div><div class="d-val">'+(job.approval_count||0)+' / '+(job.required_approvals||5)+'</div></div>';
    h+='<div><div class="d-label">Total Tasks</div><div class="d-val">'+job.total_tasks+'</div></div>';
    h+='</div></div>';

    // Tasks
    h+='<div class="section"><div class="section-header"><div class="section-title">Tasks ('+((tasks&&tasks.length)||0)+')</div></div>';

    if(tasks&&tasks.length>0){
      for(var i=0;i<tasks.length;i++){
        var tk=tasks[i];
        var tp=tk.progress_percent||0;
        var an=tk.claimed_by&&am[tk.claimed_by]?am[tk.claimed_by].name:(tk.claimed_by?SI(tk.claimed_by):'-');
        var td=DUR(tk.started_at,tk.completed_at||(tk.status==='in_progress'?null:tk.started_at));
        var isPlan=tk.task_spec&&tk.task_spec.type==='plan';

        h+='<div class="tk-card" id="tc-'+tk.id+'">';
        h+='<div class="tk-hdr" onclick="_toggle(\\''+tk.id+'\\')">';
        h+='<div class="tk-idx">#'+tk.task_index+'</div>';
        h+='<div class="tk-main"><div class="tk-top">'+B(tk.status);
        if(isPlan)h+=' <span class="tk-type">PLAN</span>';
        if(tk.claimed_by)h+=' <span class="tk-agent">&#129302; '+E(an)+'</span>';
        if(tk.started_at&&(tk.status==='in_progress'||tk.status==='completed'||tk.status==='failed'))h+=' <span class="dur-chip">'+td+'</span>';
        h+='</div><div class="tk-times">';
        if(tk.assigned_at)h+='<span>Claimed: '+FT(tk.assigned_at)+'</span>';
        if(tk.started_at)h+='<span>Started: '+FT(tk.started_at)+'</span>';
        if(tk.completed_at)h+='<span>Finished: '+FT(tk.completed_at)+'</span>';
        if(!tk.assigned_at&&!tk.started_at)h+='<span>Created: '+FT(tk.created_at)+'</span>';
        h+='</div></div>';

        h+='<div class="tk-prog"><div class="tk-pct">'+tp+'%</div>';
        h+='<div class="pbar-wrap" style="height:4px"><div class="pbar-fill" style="width:'+tp+'%"></div></div></div>';
        h+='<div class="tk-arrow" id="ar-'+tk.id+'">&#8250;</div></div>';

        h+='<div class="tk-body" id="bd-'+tk.id+'"></div>';
        h+='</div>';
      }
    } else {
      if(job.status==='committed'||job.status==='approving'){
        h+='<div class="empty"><div class="empty-text">Tasks will be created after job is approved and planned</div></div>';
      } else if(job.status==='accepted'){
        h+='<div class="empty"><div class="empty-text">Waiting for plan task to be created...</div></div>';
      } else {
        h+='<div class="empty"><div class="empty-text">No tasks</div></div>';
      }
    }

    h+='</div>';
    el.innerHTML=h;

    // Re-expand previously expanded tasks
    expanded.forEach(function(tid){
      var bd=document.getElementById('bd-'+tid);
      var ar=document.getElementById('ar-'+tid);
      if(bd&&ar){
        bd.classList.add('open');
        ar.classList.add('open');
        // Re-fetch the task body content if it was loaded before
        if(bd.getAttribute('data-ok')!=='1'){
          loadTaskBody(tid);
        }
      }
    });
  }

  function buildDAG(job, events){
    var stages=['committed','approving','accepted','planning','ready','executing','completed'];
    var labels={committed:'Submitted',approving:'Approving',accepted:'Accepted',planning:'Planning',ready:'Ready',executing:'Executing',completed:'Completed'};
    var icons={committed:'&#128220;',approving:'&#9989;',accepted:'&#127942;',planning:'&#128221;',ready:'&#128640;',executing:'&#9881;',completed:'&#127881;'};

    var isFailed=job.status==='failed';
    var curIdx=stages.indexOf(job.status);
    if(isFailed){
      // Find the last non-failed stage based on events
      curIdx=stages.length; // will show all as past
    }

    // Build event map: eventType → first timestamp
    var evMap={};
    if(events){
      events.forEach(function(ev){
        // Map event types to stages
        var mapping={
          submitted:'committed',
          approval_started:'approving',
          approved:'approving',
          accepted:'accepted',
          plan_created:'planning',
          plan_completed:'planning',
          tasks_created:'ready',
          execution_started:'executing',
          completed:'completed',
          failed:'failed'
        };
        var stage=mapping[ev.event_type];
        if(stage&&!evMap[stage])evMap[stage]=ev.created_at;
      });
    }

    var h='<div class="dag">';
    for(var i=0;i<stages.length;i++){
      var st=stages[i];
      var cls='future';
      var lblCls='';
      if(isFailed){
        if(evMap[st]){cls='past';lblCls='past';}
        else{cls='future';}
      } else if(i<curIdx){cls='past';lblCls='past';}
      else if(i===curIdx){cls='current';lblCls='current';}

      h+='<div class="dag-node">';
      h+='<div class="dag-circle '+cls+'">'+icons[st]+'</div>';
      h+='<div class="dag-label '+lblCls+'">'+labels[st]+'</div>';
      if(evMap[st])h+='<div class="dag-time">'+FT(evMap[st])+'</div>';
      if(st==='approving'){
        h+='<div class="dag-badge">'+(job.approval_count||0)+'/'+(job.required_approvals||5)+'</div>';
      }
      h+='</div>';

      if(i<stages.length-1){
        var edgeCls=(i<curIdx||(isFailed&&evMap[stages[i+1]]))?'past':'';
        h+='<div class="dag-edge '+edgeCls+'"></div>';
      }
    }

    if(isFailed){
      h+='<div class="dag-edge"></div>';
      h+='<div class="dag-node">';
      h+='<div class="dag-circle failed">&#10060;</div>';
      h+='<div class="dag-label" style="color:#f87171;font-weight:600">Failed</div>';
      if(evMap.failed)h+='<div class="dag-time">'+FT(evMap.failed)+'</div>';
      h+='</div>';
    }

    h+='</div>';
    return h;
  }

  async function loadTaskBody(tid){
    var bd=document.getElementById('bd-'+tid);
    if(!bd)return;
    bd.innerHTML='<div style="padding:12px;color:#64748b;font-size:13px">Loading...</div>';

    var tkResp=await F('/api/tasks/'+tid);
    var tk=(tkResp&&tkResp.success)?tkResp.data:tkResp;
    var histResp=await F('/api/tasks/'+tid+'/history');
    var hist=(histResp&&histResp.success)?histResp.data:histResp;
    var plogResp=await F('/api/tasks/'+tid+'/progress');
    var plog=(plogResp&&plogResp.success)?plogResp.data:plogResp;
    if(!tk){bd.innerHTML='<div style="color:#f87171;padding:12px">Failed to load</div>';return;}

    var h='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">';

    // Left: spec + result
    h+='<div>';
    h+='<div class="jv-label">Task Specification</div>';
    h+='<div class="jv">'+PJ(tk.task_spec)+'</div>';

    if(tk.result){
      h+='<div class="jv-label">Execution Result</div>';
      h+='<div class="jv">'+PJ(tk.result)+'</div>';
    }
    if(tk.error_message){
      h+='<div class="jv-label" style="color:#f87171">Error Message</div>';
      h+='<div class="jv" style="border-color:#450a0a;color:#f87171">'+E(tk.error_message)+'</div>';
    }

    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">';
    h+='<div><div class="d-label">Timeout</div><div class="d-val">'+tk.timeout_seconds+'s</div></div>';
    h+='<div><div class="d-label">Retries</div><div class="d-val">'+tk.retry_count+' / '+tk.max_retries+'</div></div>';
    h+='</div></div>';

    // Right: timeline
    h+='<div>';
    h+='<div class="jv-label">Activity Timeline</div>';
    if(hist&&hist.length>0){
      h+='<div class="tl">';
      for(var i=0;i<hist.length;i++){
        var ev=hist[i];
        var evd='';
        if(ev.agent_id)evd='Agent: '+SI(ev.agent_id);
        if(ev.details){
          var dd=typeof ev.details==='string'?JSON.parse(ev.details):ev.details;
          if(dd.progress_percent!==undefined)evd+=' | Progress: '+dd.progress_percent+'%';
          if(dd.message)evd+=' | '+E(dd.message);
          if(dd.error)evd+=' | Error: '+E(dd.error);
          if(dd.retry_count)evd+=' | Retry #'+dd.retry_count;
        }
        h+='<div class="tl-item"><div class="tl-dot '+ev.event_type+'"></div>';
        h+='<div class="tl-ev">'+ev.event_type+'</div>';
        h+='<div class="tl-time">'+FT(ev.created_at)+'</div>';
        if(evd)h+='<div class="tl-det">'+evd+'</div>';
        h+='</div>';
      }
      h+='</div>';
    } else {
      h+='<div style="color:#475569;font-size:13px;padding:12px 0">No activity recorded</div>';
    }

    if(plog&&plog.length>0){
      h+='<div class="jv-label" style="margin-top:16px">Progress Reports ('+plog.length+')</div>';
      h+='<div style="max-height:200px;overflow:auto">';
      for(var p=0;p<plog.length;p++){
        var pr=plog[p];
        h+='<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #1e293b;font-size:12px">';
        h+='<span style="color:#38bdf8;font-weight:600;width:36px;text-align:right">'+pr.progress_percent+'%</span>';
        h+='<span style="color:#475569;width:110px">'+FT(pr.reported_at)+'</span>';
        h+='<span style="color:#94a3b8;flex:1">'+(pr.message?E(pr.message):'-')+'</span></div>';
      }
      h+='</div>';
    }

    h+='</div></div>';
    bd.innerHTML=h;
    bd.setAttribute('data-ok','1');
  }

  window._toggle=async function(tid){
    var bd=document.getElementById('bd-'+tid);
    var ar=document.getElementById('ar-'+tid);
    if(!bd||!ar)return;
    if(bd.classList.contains('open')){bd.classList.remove('open');ar.classList.remove('open');return;}
    bd.classList.add('open');ar.classList.add('open');
    if(bd.getAttribute('data-ok')==='1')return;
    await loadTaskBody(tid);
  };

  async function doRefresh(){
    var healthResp=await F('/api/health');
    var health=healthResp&&(healthResp.success||healthResp.status==='ok');
    var el=document.getElementById('healthStatus');
    if(health){el.textContent='Healthy';el.style.color='#4ade80';}
    else{el.textContent='Disconnected';el.style.color='#f87171';}
    if(curPage==='home')await refreshHome();
    else if(curPage==='detail')await refreshDetail();
  }

  doRefresh();
  setInterval(doRefresh,5000);
})();
</script>
</body>
</html>`;
}
