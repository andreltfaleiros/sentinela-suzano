// Vercel Edge Function — SENTINELA · Módulo de Resposta IA
// Recebe um reporte e retorna: triagem de risco + resposta humanizada (se aplicável)

const PALAVRAS_CRITICAS = [
  'acidente','lesão','lesao','ferimento','sangue','morte','morreu','morto',
  'assédio','assedio','abuso','violência','violencia','ameaça','ameaca',
  'suicídio','suicidio','suicidar','me matar','quero morrer',
  'socorro','emergência','emergencia','urgente','grave',
  'agredido','agredida','bateu','empurrou','tocou','apalpou',
  'intimidação','intimidacao','chantagear','chantagem',
];

const PROMPT_SISTEMA = `Você é o assistente de segurança do trabalho do SENTINELA, plataforma de gestão de riscos operacionais da Suzano.
Sua função é redigir uma resposta humana, empática e profissional a um reporte de segurança feito por um operador de campo.

Regras obrigatórias:
- Escreva em português brasileiro, tom acolhedor e profissional
- Confirme o recebimento pelo nome do campo/área quando disponível
- Agradeça a contribuição de forma genuína (não robótica)
- Informe o prazo de retorno com base na severidade: Alta = 24h, Média = 48h, Baixa = 72h
- Para reportes de Fator Humano (fadiga, pressão, comunicação): valide o sentimento, não apenas o fato
- Não use linguagem corporativa vazia ("estamos comprometidos com...", etc.)
- Máximo 5 linhas. Sem saudação formal de e-mail. Direto ao ponto, humano.
- Assine como: "Equipe de Segurança · Suzano"`;

function detectarPalavrasCriticas(texto) {
  if (!texto) return [];
  const lower = texto.toLowerCase();
  return PALAVRAS_CRITICAS.filter(p => lower.includes(p));
}

function classificarTriagem(reporte) {
  const textoCompleto = [
    reporte.descricao || '',
    (reporte.categorias || []).join(' '),
    (reporte.psico_tipos || []).join(' '),
  ].join(' ');

  const flagsCriticas = detectarPalavrasCriticas(textoCompleto);
  const ehGrave = reporte.severidade === 'Alta';
  const ehPsicossocial = reporte.psicossocial === true;
  const temAnonimato = reporte.psico_anonimato_reforcado === true;

  if (flagsCriticas.length > 0) {
    return {
      nivel: 'CRITICO',
      motivo: `Palavras-chave críticas detectadas: ${flagsCriticas.join(', ')}`,
      fila: 'humano',
      resposta_ia: false,
      alerta_gestor: true,
      palavras_flag: flagsCriticas,
    };
  }

  if (ehGrave) {
    return {
      nivel: 'ALTO',
      motivo: 'Severidade alta declarada pelo operador',
      fila: 'humano',
      resposta_ia: false,
      alerta_gestor: true,
      palavras_flag: [],
    };
  }

  if (ehPsicossocial) {
    return {
      nivel: 'PSICOSSOCIAL',
      motivo: 'Risco psicossocial NR-1 identificado',
      fila: 'humano',
      resposta_ia: false,
      alerta_gestor: true,
      palavras_flag: [],
      anonimato_reforcado: temAnonimato,
    };
  }

  if (reporte.severidade === 'Média') {
    return {
      nivel: 'MEDIO',
      motivo: 'Severidade média — resposta IA com revisão opcional',
      fila: 'ia',
      resposta_ia: true,
      alerta_gestor: false,
      palavras_flag: [],
    };
  }

  return {
    nivel: 'BAIXO',
    motivo: 'Severidade baixa — resposta IA automática',
    fila: 'ia',
    resposta_ia: true,
    alerta_gestor: false,
    palavras_flag: [],
  };
}

async function gerarRespostaIA(reporte) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada');

  const prazo = reporte.severidade === 'Alta' ? '24 horas'
    : reporte.severidade === 'Média' ? '48 horas' : '72 horas';

  const contexto = [
    `Área: ${reporte.unidade || reporte.area || 'não informada'}`,
    `Categorias: ${(reporte.categorias || []).join(', ') || 'não informadas'}`,
    `Severidade percebida: ${reporte.severidade || 'não informada'}`,
    reporte.descricao ? `Descrição do operador: "${reporte.descricao}"` : null,
    `Prazo de resposta: ${prazo}`,
  ].filter(Boolean).join('\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: PROMPT_SISTEMA,
      messages: [{
        role: 'user',
        content: `Reporte recebido:\n${contexto}\n\nRedija a resposta ao operador.`,
      }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const json = await resp.json();
  return json.content?.[0]?.text || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // CORS para o próprio domínio Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const reporte = req.body;
    if (!reporte || typeof reporte !== 'object') {
      return res.status(400).json({ error: 'Corpo inválido' });
    }

    const triagem = classificarTriagem(reporte);

    let resposta_texto = null;
    if (triagem.resposta_ia) {
      try {
        resposta_texto = await gerarRespostaIA(reporte);
      } catch (e) {
        console.error('Erro IA:', e.message);
        // fallback: resposta padrão se a IA falhar
        resposta_texto = `Recebemos seu reporte e agradecemos pela contribuição. Nossa equipe de segurança analisará a situação e você terá um retorno em até ${reporte.severidade === 'Média' ? '48' : '72'} horas.\n\nEquipe de Segurança · Suzano`;
      }
    }

    return res.status(200).json({
      triagem,
      resposta_texto,
      processado_em: new Date().toISOString(),
    });

  } catch (e) {
    console.error('Erro geral:', e);
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
