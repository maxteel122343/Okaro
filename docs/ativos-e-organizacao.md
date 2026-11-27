# Organização de Ativos do Projeto Okaro

Documento central para organizar **todos os ativos** gerados a cada rodada de SCAMPER e ao longo do desenvolvimento.

Cada rodada SCAMPER deve produzir ativos em uma ou mais das categorias abaixo. Estes ativos são a base para continuação, descoberta e construção dos MVPs.

## Categorias de Ativos

### 1. Artigos Científicos
Base científica e papers de referência.

- MarkerDB 2.0 (Nucleic Acids Research 2025) — ~34.500 biomarcadores
- Science Advances (2025) — multiplexed wireless sensing (high-order exceptional points)
- ACS Applied Materials & Interfaces (2025) — frequency mapping multimodal
- Trabalhos de edible electronics / LC-SRR comestíveis (Advanced Materials Technologies, 2024–2026)
- GISMO / imec — cápsulas de redox + pH + temperatura (Device 2025)
- Phone2Act e trabalhos de captura egocêntrica via smartphone para dados de robótica

**Pasta sugerida:** `docs/artigos-cientificos/`

### 2. Protótipos de Hardware
Implementações físicas ou esquemas de hardware.

- Leitor ESP32 de frequência (circuito LC / interrogador)
- Sensor LC/SRR comestível (ouro, carvão + gelatina, amido/açúcar)
- Cases e montagens 3D (forks de ESPHome-touch-display-mount, MLX90640-Thermocam, Sleep-Tracker, room-sensor)
- Patches / clips para sensores passivos
- Wearables simples (pulseira, máscara de respiração, chiclete tecnológico)

**Pasta sugerida:** `hardware-prototipos/` + `hardware-3dprint/`

### 3. Ideias ou Conceitos Inovadores
Conceitos gerados pelo SCAMPER que ainda não viraram protótipo.

- Tinta comestível + frequência como sensor universal biológico
- Smartphone como hub universal multimodal (rPPG, MediaPipe, IMU, toque)
- Arquitetura em camadas: celular → ESP32 → comestível
- Dual-use: dados de robótica + saúde assistida por IA em tempo real
- Objetos instrumentados passivos (garrafas, mesas, embalagens)
- Tracking de movimentos internos musculares / órgãos via frequência
- Ajuste fino de amplitude para identificar substâncias no estômago

**Pasta sugerida:** `docs/conceitos/`

### 4. Produtos MVP de App
Aplicações móveis ou web que entregam valor imediato.

- MVP 0: App celular puro (MediaPipe mãos/face + rPPG + IMU)
- Dashboard de saúde pessoal com IA
- Exportação de dados no formato estilo LeRobot (Parquet + vídeo)
- Biofeedback em tempo real (HR, RR, gestos)
- App de linguagem de sinais como fonte de dados de gestos

**Pasta sugerida:** `mvp-apps/`

### 5. Produtos MVP de Hardware
Dispositivos físicos mínimos prontos para uso.

- MVP 1: Celular + ESP32 leitor de frequência + 1 sensor passivo
- MVP 2: Sensor comestível / ingerível LC/SRR
- Case 3D para o leitor ESP32
- Patch de tinta comestível sprayável (carvão + gelatina)
- Pulseira ou clip com sensor de movimento

**Pasta sugerida:** `mvp-hardware/`

### 6. Artigos / Textos de Registro (não científicos, mas importantes)
Documentação de processo, decisões e registros.

- As 7 fases do SCAMPER (resumo consolidado)
- Mapeamento nas 4 direções (inovação, comercial, artigos, MVP)
- Roadmap de MVPs em camadas
- Notas de continuidade e equívocos eliminados
- Índice de biomarcadores e downloads do MarkerDB
- Referências de impressão 3D e hardware

**Pasta sugerida:** `docs/registros/`  
(já existem arquivos relacionados em `biomarkers-references/` e `hardware-3dprint/`)

### 7. Frameworks de Integração
Estruturas que conectam os 3 pilares (dados de robótica + biomarcadores + vibecode).

- Arquitetura em camadas (Celular → ESP32 → Comestível → IA)
- Fluxo de dados: captura → timestamps → armazenamento → exportação (LeRobot + dashboard)
- Pipeline dual-use (saúde pessoal + treino de políticas VLA)
- Templates de firmware ESP32 + Bluetooth
- Integração com MediaPipe / ARKit / rPPG

**Pasta sugerida:** `frameworks/`

### 8. Protótipos de Hardware que Amplificam a Capacidade da IA de Ver
Sensores e montagens que aumentam o que a IA consegue perceber do mundo e do corpo.

- Smartphone como sensor universal (mãos 21 pontos, face, olhos, rPPG, toque)
- Leitor de frequência passivo (múltiplos parâmetros sem bateria)
- Sensores comestíveis / ingeríveis (GI: pH, redox, temperatura)
- mmWave (presença / respiração) — referência room-sensor
- Câmera térmica simples (MLX90640)
- Wearable de sono / movimento (MPU6050 + MAX30102)
- Tracking de escrita (pressão, estilo) e linguagem de sinais

**Pasta sugerida:** `hardware-ia-vision/`

### 9. Datasets e Amostras de Dados
Dados brutos ou processados gerados pelas capturas.

- Exportações no formato estilo LeRobot (Parquet + vídeo + timestamps)
- Sequências de gestos e manipulação capturadas pelo celular
- Leituras de frequência de sensores passivos (pH, temperatura, strain)
- Dados de rPPG (HR, RR, HRV)
- Amostras de escrita, mastigação, expressões faciais ou linguagem de sinais

**Pasta sugerida:** `datasets/`

### 10. Firmware e Templates de Código
Código reutilizável que acelera a camada de vibecode.

- Firmware ESP32 de interrogação de frequência LC/SRR
- Scripts de captura com MediaPipe + sincronização de timestamps
- Script de download dos datasets do MarkerDB
- Templates de comunicação Bluetooth entre ESP32 e celular
- Código de biofeedback em tempo real

**Pasta sugerida:** `firmware/` ou `code-templates/`

### 11. Resultados Experimentais e Logs de Validação
Registros do que funcionou, o que não funcionou e calibragens.

- Testes de precisão de sensores passivos (pH, temperatura, íons)
- Calibração de leitores de frequência
- Equívocos eliminados em cada fase SCAMPER
- Logs de captura e qualidade dos dados
- Comparações entre camadas (só celular vs. celular + ESP32)

**Pasta sugerida:** `experimentos/`

### 12. Modelos 3D e Arquivos de Fabricação
Arquivos prontos para impressão ou fabricação.

- STL / 3MF de cases para ESP32
- OpenSCAD de clips, patches e montagens
- Arquivos KiCad de PCBs simples para o leitor de frequência
- Modelos de wearables (pulseira, clip de sensor)
- Forks de cases existentes (room-sensor, MLX90640-Thermocam etc.)

**Pasta sugerida:** `hardware-3dprint/models/`

### 13. Esquemas e Circuitos
Diagramas elétricos e de montagem.

- Circuito do leitor de frequência ESP32
- Diagrama do sensor LC/SRR comestível
- Layout de wearable com IMU + sensor óptico
- Esquema de interrogação passiva sem bateria
- Diagrama de integração celular + ESP32

**Pasta sugerida:** `esquemas/`

### 14. Modelos de Incentivo e Consentimento
Mecanismos para dual-use e crowdsourcing de dados.

- Fluxos de consentimento claro para compartilhamento de dados
- Modelos de parceria e recompensa (estilo descontos por uso)
- Termos de uso dual (saúde pessoal + treino de robótica)
- Estratégias de valor imediato para o usuário (biofeedback)

**Pasta sugerida:** `docs/consentimento-incentivos/`

### 15. Demonstrações e Registros Visuais
Vídeos, fotos e GIFs que facilitam entendimento e continuidade.

- Vídeos de captura de gestos e manipulação
- Fotos de proótipos de hardware e montagens 3D
- GIFs de biofeedback em tempo real
- Registros de testes de sensores comestíveis
- Demonstrações de linguagem de sinais ou escrita

**Pasta sugerida:** `demos/`

## Lista de Ativos Importantes a Considerar Sempre

| Tipo de Ativo | Exemplos | Por que é importante |
|---------------|----------|------------------------|
| Dataset de biomarcadores | MarkerDB TSV/XML (~34k) | Base para marcadores biológicos |
| Firmware ESP32 | Leitor de frequência | Camada 1 de hardware |
| Modelos 3D / STL | Cases e montagens | Prototipagem rápida |
| App de captura | MediaPipe + rPPG | Camada 0 (zero hardware extra) |
| Formato de exportação | Estilo LeRobot | Dados para robótica |
| Conceitos SCAMPER | Frequência + comestível | Direção de inovação |
| Documentação de fases | Resumos SCAMPER | Continuidade e rastreabilidade |
| Referências científicas | Papers 2024–2026 | Fundamentação |
| Forks de hardware | Cases e sensores 3D | Reuso e adaptação |
| Datasets de captura | Gestos, rPPG, frequência | Treino de modelos e validação |
| Resultados experimentais | Calibragens e logs | Aprendizado e eliminação de erros |
| Esquemas e circuitos | Leitor LC, sensor comestível | Replicação e melhoria |
| Consentimento e incentivos | Fluxos dual-use | Sustentabilidade do crowdsourcing |

## Como Usar Este Documento

1. A cada nova rodada SCAMPER, adicione os ativos gerados nas categorias correspondentes.
2. Mantenha links para pastas, repositórios e arquivos reais.
3. Use este índice como ponto de entrada para continuação e descoberta.
4. Priorize ativos que conectem os 3 pilares: dados de robótica, biomarcadores e vibecode hardware.

---

*Atualizado com 15 tipos de ativos para cobrir todas as rodadas SCAMPER e garantir continuidade do projeto.*
