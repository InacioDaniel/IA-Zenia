// modelo de ia geradora de video, o wy mais duro da banda fez isso

(() => {
  // controller visível a todo o módulo (para cancelar geração de imagem / vídeo)
  let controller = { cancelled: false };

  // util
  const $ = id => document.getElementById(id);
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  // DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // ensure canvas exists & has context
    let canvas = $('zenia-viewport');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'zenia-viewport';
      canvas.width = 256; canvas.height = 256;
      document.querySelector('.canvas-wrap')?.prepend(canvas) || document.body.appendChild(canvas);
    }
    const previewCtx = canvas.getContext('2d', { willReadFrequently: true });

    // Chat UI (simple, backed by Wikipedia lookups)
    const chatEl = $('chat');
    const chatInput = $('chatInput');
    const chatSend = $('chatSend');
    const convo = [];
    function renderChat() {
      if (!chatEl) return;
      chatEl.innerHTML = '';
      for (const m of convo) {
        const div = document.createElement('div');
        div.className = 'chat-message ' + (m.role === 'user' ? 'user' : 'zenia');
        div.innerHTML = `<div>${escapeHtml(m.text).replace(/\n/g,'<br>')}</div>`;
        if (m.attachment) {
          if (m.attachment.type === 'image' && m.attachment.url) {
            const img = document.createElement('img');
            img.src = m.attachment.url; img.className = 'thumbnail'; div.appendChild(img);
          }
        }
        chatEl.appendChild(div);
      }
      chatEl.scrollTop = chatEl.scrollHeight;
    }
    convo.push({ role:'zenia', text: 'Oi — sou a Zenia. Posso gerar imagens e vídeos procedurais de personagens. Pergunte algo!' });
    renderChat();

    async function wikiSearchAndExtract(term) {
      if (!term) return null;
      const api = 'https://pt.wikipedia.org/w/api.php';
      try {
        const sparams = new URLSearchParams({ action:'query', list:'search', srsearch:term, srlimit:'1', format:'json', origin:'*' });
        const sres = await fetch(`${api}?${sparams.toString()}`);
        if (!sres.ok) return null;
        const sjson = await sres.json();
        const sr = (sjson.query && sjson.query.search && sjson.query.search[0]) || null;
        if (!sr) return null;
        const pageid = sr.pageid;
        const qparams = new URLSearchParams({ action:'query', pageids:String(pageid), prop:'extracts', exintro:'1', explaintext:'1', format:'json', origin:'*' });
        const qres = await fetch(`${api}?${qparams.toString()}`);
        if (!qres.ok) return null;
        const qjson = await qres.json();
        const page = qjson.query && qjson.query.pages && qjson.query.pages[pageid];
        return { title: sr.title, extract: page?.extract || null, pageUrl: `https://pt.wikipedia.org/wiki/${encodeURIComponent(sr.title)}` };
      } catch (e) { console.warn(e); return null; }
    }

    chatSend?.addEventListener('click', async () => {
      const v = chatInput.value; if (!v) return; chatInput.value = '';
      convo.push({ role:'user', text: v }); renderChat();
      convo.push({ role:'zenia', text: 'Deixa eu procurar isso pra você...' }); renderChat();
      const wiki = await wikiSearchAndExtract(v);
      convo.pop(); // remove "procurando"
      if (wiki && wiki.extract) {
        convo.push({ role:'zenia', text: `Encontrei: ${wiki.title}\n\n${wiki.extract}\n\n${wiki.pageUrl}` });
      } else {
        convo.push({ role:'zenia', text: 'Não encontrei resumo direto. Posso gerar animações de personagens com base no prompt. Quer tentar?' });
      }
      renderChat();
    });
    chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') chatSend.click(); });

    // ------------------------------------------------------------------
    // Procedural character renderer + video recorder
    // ------------------------------------------------------------------

    // draw one character (cartoon-ish) using simple skeleton
    function drawCharacter(ctx, w, h, pose, style){
      const x = pose.x * w;
      const y = pose.y * h;
      const s = pose.scale || 1;
      ctx.save();
      ctx.translate(x, y);

      // torso
      ctx.save();
      ctx.rotate(pose.torsoAngle || 0);
      ctx.fillStyle = style.cloth || '#2b90d9';
      const torsoW = 22 * s, torsoH = 40 * s;
      ctx.beginPath(); ctx.ellipse(0, 0, torsoW, torsoH, 0, 0, Math.PI*2); ctx.fill();

      // head
      ctx.save();
      ctx.translate(0, -torsoH * 0.9);
      ctx.rotate(pose.headAngle || 0);
      ctx.fillStyle = style.skin || '#f2c7a0';
      ctx.beginPath(); ctx.arc(0, -12 * s, 14 * s, 0, Math.PI*2); ctx.fill();
      ctx.restore();

      // arms
      function drawArm(side, angle){
        ctx.save();
        const armX = (side==='left'? -torsoW: torsoW) * 0.6;
        const armY = -torsoH * 0.2;
        ctx.translate(armX, armY);
        ctx.rotate(angle);
        ctx.fillStyle = style.body || '#6b4423';
        ctx.beginPath(); ctx.ellipse(0, 10 * s, 6 * s, 12 * s, 0, 0, Math.PI*2); ctx.fill();
        ctx.translate(0, 22 * s);
        ctx.rotate(0.1);
        ctx.beginPath(); ctx.ellipse(0, 10 * s, 6 * s, 12 * s, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 22 * s, 5 * s, 0, Math.PI*2); ctx.fillStyle = style.skin || '#f2c7a0'; ctx.fill();
        ctx.restore();
      }
      drawArm('left', pose.leftArmAngle || 0);
      drawArm('right', pose.rightArmAngle || 0);

      // legs
      function drawLeg(side, angle){
        ctx.save();
        const legX = (side==='left'? -torsoW*0.3: torsoW*0.3);
        const legY = torsoH * 0.7;
        ctx.translate(legX, legY);
        ctx.rotate(angle);
        ctx.fillStyle = style.body || '#6b4423';
        ctx.beginPath(); ctx.ellipse(0, 12 * s, 7 * s, 16 * s, 0, 0, Math.PI*2); ctx.fill();
        ctx.translate(0, 28 * s);
        ctx.beginPath(); ctx.fillStyle = '#222'; ctx.ellipse(5 * s, 6 * s, 8 * s, 4 * s, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      drawLeg('left', pose.leftLegAngle || 0);
      drawLeg('right', pose.rightLegAngle || 0);

      ctx.restore(); // torso
      ctx.restore(); // translate
    }

    // create pose for action at normalized time t in [0,1]
    function buildPose(action, t, idx=0, count=1){
      const x = 0.2 + 0.6 * (idx / (Math.max(1, count-1) || 1));
      const yBase = 0.5;
      const phase = t * Math.PI * 2;
      const pose = { x, y: yBase, scale: 1.0 };

      switch(action){
        case 'run':
          pose.torsoAngle = Math.sin(phase*1.9) * 0.08;
          pose.headAngle = Math.sin(phase*1.9) * 0.05;
          pose.leftArmAngle = Math.sin(phase*1.9) * 0.9 - 0.4;
          pose.rightArmAngle = Math.sin(phase*1.9 + Math.PI) * 0.9 - 0.4;
          pose.leftLegAngle = Math.sin(phase*1.9 + Math.PI) * 0.9;
          pose.rightLegAngle = Math.sin(phase*1.9) * 0.9;
          pose.y = yBase + Math.abs(Math.sin(phase*1.9)) * 0.03;
          break;
        case 'jump': {
          const jt = Math.sin(Math.max(0, 1 - Math.abs((t - 0.5) * 2)) * Math.PI);
          pose.torsoAngle = Math.sin(phase) * 0.05;
          pose.leftArmAngle = -0.6 - jt * 1.2;
          pose.rightArmAngle = -0.6 - jt * 1.2;
          pose.leftLegAngle = 0.2 + jt * -1.2;
          pose.rightLegAngle = 0.2 + jt * -1.2;
          pose.y = yBase - jt * 0.18;
        } break;
        case 'dance':
          pose.torsoAngle = Math.sin(phase * 2.2 + idx) * 0.3;
          pose.headAngle = Math.cos(phase * 2.2 + idx) * 0.25;
          pose.leftArmAngle = Math.sin(phase * 2.5 + idx) * 1.8 - 0.3;
          pose.rightArmAngle = Math.cos(phase * 2.5 + idx) * 1.8 - 0.3;
          pose.leftLegAngle = Math.sin(phase * 1.5 + idx) * 0.8;
          pose.rightLegAngle = Math.cos(phase * 1.5 + idx) * 0.8;
          pose.y = yBase + Math.sin(phase * 2.5 + idx) * 0.02;
          break;
        case 'play':
          pose.torsoAngle = Math.sin(phase*1.3)*0.15;
          pose.headAngle = Math.sin(phase*1.3 + 0.3)*0.12;
          pose.leftArmAngle = Math.sin(phase*2 + idx)*1.2 - 0.6;
          pose.rightArmAngle = Math.sin(phase*2 + idx + 0.7)*1.2 - 0.6;
          pose.leftLegAngle = Math.sin(phase*1.6 + idx)*0.9;
          pose.rightLegAngle = Math.cos(phase*1.6 + idx)*0.9;
          pose.y = yBase + Math.sin(phase*1.6 + idx) * 0.03;
          break;
        default:
          pose.torsoAngle = Math.sin(phase) * 0.03;
          pose.headAngle = Math.sin(phase*1.1) * 0.02;
          pose.leftArmAngle = -0.6 + Math.sin(phase*0.9)*0.2;
          pose.rightArmAngle = -0.6 + Math.cos(phase*0.9)*0.2;
          pose.leftLegAngle = 0.05 + Math.sin(phase*0.8)*0.1;
          pose.rightLegAngle = -0.05 + Math.cos(phase*0.8)*0.1;
      }
      return pose;
    }

    // generate frames, draw to preview canvas and record WebM
    async function generateCharacterAnimation({ width=256, height=256, fps=12, duration=4, action='run', characters=1, bg='#0b0c0f', seed=42 } = {}){
      controller.cancelled = false;
      const totalFrames = Math.max(1, Math.round(duration * fps));
      // set preview canvas size
      canvas.width = width; canvas.height = height;

      // offscreen for recording
      const off = document.createElement('canvas');
      off.width = width; off.height = height;
      const ctx = off.getContext('2d');

      const stream = off.captureStream(fps);
      const chunks = [];
      let recorder;
      try { recorder = new MediaRecorder(stream, { mimeType:'video/webm; codecs=vp9' }); }
      catch(e){ recorder = new MediaRecorder(stream); }
      recorder.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      recorder.start();

      for (let f=0; f<totalFrames; f++){
        if (controller.cancelled) break;
        const t = f / totalFrames;
        // bg
        ctx.fillStyle = bg; ctx.fillRect(0,0,width,height);
        // ground
        ctx.fillStyle = '#17202a'; ctx.fillRect(0, height * 0.72, width, height * 0.28);

        for (let c=0; c<characters; c++){
          const pose = buildPose(action, t, c, characters);
          const clothPal = ['#2b90d9','#d95c5c','#7bd37b','#d89fd6','#f0a43a'];
          const cloth = clothPal[(seed + c) % clothPal.length];
          drawCharacter(ctx, width, height, pose, { cloth, body:'#3b2a20', skin:'#f2c7a0' });
        }

        // particles
        ctx.globalAlpha = 0.12;
        for (let p=0; p<6; p++){
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(30 + (p*40), 30 + Math.sin((t + p)*5)*6, 4, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // copy to preview
        previewCtx.clearRect(0,0,canvas.width,canvas.height);
        previewCtx.drawImage(off, 0, 0, canvas.width, canvas.height);

        await new Promise(r => setTimeout(r, 1000 / fps));
      }

      recorder.stop();
      await new Promise(resolve => { recorder.onstop = resolve; });
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      return blob;
    }

    // expose generator
    window.ZeniaVideo = window.ZeniaVideo || {};
    window.ZeniaVideo.generateCharacterAnimation = generateCharacterAnimation;

    // ------------------------------------------------------------------
    // UI wiring for video controls
    // ------------------------------------------------------------------
    const generateVideoBtn = $('generateVideoBtn');
    const downloadVideoBtn = $('downloadVideoBtn');
    const videoAction = $('videoAction');
    const videoChars = $('videoChars');
    const videoDuration = $('videoDuration');
    const videoFps = $('videoFps');
    const resSlider = $('resSlider');
    const statusBar = $('status-bar');
    const statusText = $('status-text');

    let lastVideoBlob = null;

    generateVideoBtn?.addEventListener('click', async () => {
      controller.cancelled = false;
      const action = videoAction?.value || 'run';
      const chars = Math.max(1, Math.min(6, Number(videoChars?.value) || 1));
      const duration = Math.max(1, Number(videoDuration?.value) || 4);
      const fps = Math.max(6, Math.min(30, Number(videoFps?.value) || 12));
      const res = Number(resSlider?.value) || 256;

      generateVideoBtn.disabled = true;
      downloadVideoBtn.disabled = true;
      if (statusText) statusText.innerText = 'Gerando vídeo...';
      if (statusBar) statusBar.style.width = '0%';

      try {
        const blob = await generateCharacterAnimation({
          width: res, height: res, fps, duration, action, characters: chars, seed: Date.now() % 65536
        });
        lastVideoBlob = blob;
        if (downloadVideoBtn) downloadVideoBtn.disabled = false;
        if (statusText) statusText.innerText = 'Vídeo gerado — pronto para download';
        if (statusBar) statusBar.style.width = '100%';
      } catch (e) {
        console.error(e); if (statusText) statusText.innerText = 'Erro ao gerar vídeo';
      } finally { generateVideoBtn.disabled = false; }
    });

    downloadVideoBtn?.addEventListener('click', () => {
      if (!lastVideoBlob) return;
      const url = URL.createObjectURL(lastVideoBlob);
      const a = document.createElement('a');
      a.href = url; a.download = `zenia_video_${Date.now()}.webm`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    // expose cancel capability
    window.cancelGeneration = () => {
      controller.cancelled = true;
      if (statusText) statusText.innerText = 'Cancelado';
    };

    // fim do DOMContentLoaded
	//vaos embora, vai rodar
  });
})();