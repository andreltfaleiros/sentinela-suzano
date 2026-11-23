// Vercel Function — SENTINELA · Gerar relatório mensal
// Calcula os dados do mês anterior e salva na tabela relatorios_mensais
// Chamado automaticamente pelo Supabase pg_cron no 1º dia útil do mês
// ou manualmente pelo gestor pelo painel

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração Supabase ausente' });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    // Define o mês de referência (mês anterior)
    const agora = new Date();
    const mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString();
    const fimMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
    const mesLabel = mesAnterior.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Busca reportes do mês anterior
    const { data: reportes, error } = await sb
      .from('reportes')
      .select('*')
      .gte('criado_em', inicioMes)
      .lt('criado_em', fimMes);

    if (error) throw error;

    const rows = reportes || [];
    const total = rows.length;
    const alta = rows.filter(r => r.severidade === 'Alta' || r.severidade === 'Crítica').length;
    const comAcao = rows.filter(r => r.acao_publica).length;
    const psicossocial = rows.filter(r => r.psicossocial).length;
    const taxaResposta = total > 0 ? Math.round(comAcao / total * 100) : 0;

    // Categoria mais reportada
    const catCount = {};
    rows.forEach(r => (r.categorias || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }));
    const sorted = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
    const topCat = sorted[0]?.[0] || null;
    const topCatN = sorted[0]?.[1] || 0;

    // Semanas do mês
    const porSemana = [0, 0, 0, 0, 0];
    rows.forEach(r => {
      if (!r.criado_em) return;
      const d = new Date(r.criado_em);
      const semana = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
      porSemana[semana]++;
    });

    // Gera resumo textual via IA
    let resumoIA = null;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && total > 0) {
      try {
        const prompt = `Você é o sistema SENTINELA de gestão de risco operacional da Suzano.
Gere um parágrafo executivo de 3–4 frases resumindo o mês de ${mesLabel}.
Dados: ${total} reportes no total, ${alta} de severidade alta, ${comAcao} com ação corretiva registrada (taxa de resposta ${taxaResposta}%), ${psicossocial} relacionados a risco psicossocial.
${topCat ? `Categoria mais reportada: ${topCat} (${topCatN} reportes).` : ''}
Seja direto, objetivo e use linguagem executiva. Destaque o que melhorou e o que ainda requer atenção.`;

        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (aiResp.ok) {
          const aiJson = await aiResp.json();
          resumoIA = aiJson.content?.[0]?.text?.trim() || null;
        }
      } catch (eIA) { /* IA falhou — relatório continua sem resumo */ }
    }

    const dados = {
      total,
      alta,
      com_acao: comAcao,
      psicossocial,
      taxa_resposta: taxaResposta,
      top_categoria: topCat,
      top_categoria_n: topCatN,
      por_semana: porSemana,
      categorias_todas: catCount,
      resumo_ia: resumoIA,
    };

    // Salva na tabela relatorios_mensais
    const { error: insertErr } = await sb.from('relatorios_mensais').upsert({
      mes_referencia: mesLabel,
      inicio_periodo: inicioMes,
      fim_periodo: fimMes,
      dados,
      criado_em: new Date().toISOString(),
    }, { onConflict: 'mes_referencia' });

    if (insertErr) throw insertErr;

    return res.status(200).json({ ok: true, mes: mesLabel, total });

  } catch (e) {
    console.error('Erro ao gerar relatório:', e);
    return res.status(500).json({ error: 'Falha ao gerar relatório', detail: e.message });
  }
};
