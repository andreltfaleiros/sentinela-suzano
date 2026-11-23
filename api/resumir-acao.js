// Vercel Function — SENTINELA · Resumir ação corretiva para o mural público
// Recebe o texto original do gestor e retorna versão anonimizada para publicação

const PROMPT_ANONIMIZACAO = `Você é um assistente de segurança do trabalho que prepara textos para publicação no mural coletivo de segurança da Suzano.

Sua tarefa: receber o texto de uma ação corretiva registrada pelo gestor e reescrevê-la de forma generalizada, removendo qualquer detalhe que possa identificar o operador que fez o reporte original.

Regras obrigatórias:
- Remova referências a: turno específico, horário exato, nome de pessoas, número de matrícula, local muito específico (mantenha só a área geral)
- Mantenha: a natureza do problema, a ação tomada, o resultado esperado
- Escreva em terceira pessoa, no passado
- Seja direto e objetivo. Máximo 2 frases.
- Não use frases como "foi identificado que..." — vá direto à ação
- Exemplo bom: "Área de acesso à trilha 14 foi sinalizada com fita de segurança e cones. Manutenção programada para verificação do equipamento na semana seguinte."
- Exemplo ruim: "O operador do turno da manhã de segunda relatou problema, então a gente foi lá e sinalizou"`;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { acao } = req.body || {};
    if (!acao || typeof acao !== 'string' || acao.trim().length < 10) {
      return res.status(400).json({ error: 'Texto da ação muito curto ou ausente' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // fallback: retorna texto original truncado se não há API key
      return res.status(200).json({ resumo: acao.slice(0, 200) });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        system: PROMPT_ANONIMIZACAO,
        messages: [{
          role: 'user',
          content: `Texto do gestor para anonimizar:\n"${acao.trim()}"`,
        }],
      }),
    });

    if (!resp.ok) {
      // fallback gracioso
      return res.status(200).json({ resumo: acao.slice(0, 200), fallback: true });
    }

    const json = await resp.json();
    const resumo = json.content?.[0]?.text?.trim() || acao.slice(0, 200);

    return res.status(200).json({ resumo });

  } catch (e) {
    // fallback: nunca bloqueia o fluxo
    const { acao } = req.body || {};
    return res.status(200).json({ resumo: (acao || '').slice(0, 200), fallback: true });
  }
};
