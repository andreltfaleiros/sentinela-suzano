// Vercel Function — SENTINELA · Gerar deck mensal HTML via IA
// Recebe dados do relatório mensal e retorna HTML de apresentação visual

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { relatorio } = req.body || {};
  if (!relatorio) {
    return res.status(400).json({ error: 'Dados do relatório ausentes' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key ausente' });
  }

  const r = relatorio.dados || {};
  const mes = relatorio.mes_referencia || 'mês anterior';

  const prompt = `Você é um designer de apresentações executivas. Crie um deck HTML completo e auto-contido para o relatório mensal de segurança operacional da Suzano, referente a ${mes}.

Dados do relatório:
- Total de reportes: ${r.total || 0}
- Severidade alta/crítica: ${r.alta || 0}
- Com ação corretiva: ${r.com_acao || 0} (${r.taxa_resposta || 0}% de taxa de resposta)
- Risco psicossocial: ${r.psicossocial || 0}
- Categoria mais reportada: ${r.top_categoria || 'N/A'} (${r.top_categoria_n || 0}×)
${r.resumo_ia ? `- Análise: ${r.resumo_ia}` : ''}

INSTRUÇÕES PARA O HTML:
1. Crie um deck de 5–6 slides em HTML puro, sem dependências externas
2. Use a paleta de cores da Suzano: verde escuro #1B4332, verde médio #2D6A4F, verde claro #52B788, fundo #F6F8F6
3. Tipografia: system-ui, font-weight 700/800 para títulos, 400/500 para texto
4. Cada slide ocupa 100vw × 100vh, navegação por setas laterais ou teclado
5. Visual pictorial: números grandes, ícones SVG inline, barras de progresso
6. Slide 1: Capa com título "SENTINELA · Relatório de Segurança" e mês de referência
7. Slide 2: KPIs principais — total, alta severidade, taxa de resposta — com números grandes e indicador de saúde (verde/amarelo/vermelho)
8. Slide 3: Categoria mais reportada + distribuição visual (barras horizontais simples)
9. Slide 4: Ciclo de resposta — quantos reportes viraram ação corretiva
10. Slide 5: Análise executiva (texto do resumo IA em destaque)
11. Slide 6: Próximos passos (3 itens genéricos de ação)
12. Rodapé discreto em todos os slides: "SENTINELA · Gestão de Risco Operacional · Suzano"
13. Navegação: botões ← → no canto inferior + número do slide atual/total
14. O HTML deve ser completo, começando com <!DOCTYPE html>

Responda APENAS com o HTML completo, sem explicações antes ou depois.`;

  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      return res.status(500).json({ error: 'Falha na IA ao gerar deck' });
    }

    const aiJson = await aiResp.json();
    const html = aiJson.content?.[0]?.text?.trim() || '';

    if (!html || !html.includes('<!DOCTYPE')) {
      return res.status(500).json({ error: 'IA não gerou HTML válido' });
    }

    return res.status(200).json({ html });

  } catch (e) {
    console.error('Erro ao gerar deck:', e);
    return res.status(500).json({ error: 'Falha ao gerar deck', detail: e.message });
  }
};
