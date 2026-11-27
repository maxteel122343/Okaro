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

## Como Usar Este Documento

1. A cada nova rodada SCAMPER, adicione os ativos gerados nas categorias correspondentes.
2. Mantenha links para pastas, repositórios e arquivos reais.
3. Use este índice como ponto de entrada para continuação e descoberta.
4. Priorize ativos que conectem os 3 pilares: dados de robótica, biomarcadores e vibecode hardware.

---

*Criado para organizar ativos e garantir que cada rodada SCAMPER gere material útil para a continuação do projeto.*
