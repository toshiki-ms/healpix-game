# 箱庭シミュレーション定式化

## 適用範囲

- 対象は `asteroid.html`、`src/asteroid.js`、`src/asteroid-vegetation.js`、`src/earth-reference.js`、および箱庭シミュレーション用アセット・検証コード。
- オセロ、囲碁、ホーム画面、HEALPix 一般表示とは設計原則を分ける。
- 小惑星モードと地球モードは同じ植物・水・炭素・種子の基礎方程式を使い、外部条件と地形・気候・土地利用で違いを出す。

## 基本方針

- 物理過程で扱えるものは、物理過程として扱う。
- ゲーム上の望ましい結果を、ブラックボックス的な補正、任意のリミッター、特定イベント専用の例外規則で直接作らない。
- パラメータ調整は、不確実性の範囲、または外部条件の明示的な変更として行う。
- 簡易モデル化は許容する。ただし、何を近似しているか、保存量や収支にどう効くかが説明できる形にする。
- `nside` は解像度であり、惑星サイズではない。惑星半径・重力・大気の基準値は地球値で固定し、モード差は地形、土地利用、気候境界条件、初期条件、手入れイベントで表す。

## 地球モード

- 地球では実際のデータを第一参照にする。
- 海陸分布、標高、気温、降水、土地利用・植生適性は、可能な限り実データまたは実データ由来の気候・地形から決める。
- 手続き的なノイズや解析的フォールバックは、データ欠落時の暫定代替、または実データの上に重ねる小スケール変動として使う。
- 手続き的な大陸、手続き的な主要気候帯、手続き的な砂漠・森林分布を、実データの代わりに主役にしない。
- バラは地球では希少な中心オブジェクトではなく、適地で普通に自生・維持・拡大しうる植物として扱う。
- バオバブは乾燥・高温・排水性のよい環境に適し、湿潤すぎる場所では不利になる。
- 羊は地球モードだけの移動する放牧粒子として扱う。羊は若い芽を摘み、食べた炭素の一部を近傍土壌の炭素・利用可能無機養分指数へ戻す。水域・海岸を越えて移動しない。

### 地球参照データ

地球モードで使うデータは、次の優先順位で決める。

1. セルに対応する実データまたは実データ由来の gridded asset。
2. 実データを地形・気候・水文状態から診断した派生量。
3. データ欠落時だけ使う `src/earth-reference.js` の解析的フォールバック。

地球実データを使う処理では、参照データ名、解像度、asset path、値の単位、欠損時の代替を明示する。現在読み込む実データ asset は次である。

| 用途 | 参照データ | asset / 実装 | 値・単位 |
| --- | --- | --- | --- |
| 海陸分布 | NOAA NGDC ETOPO1 Global Relief Model、極域氷の解析形 | `src/earth-reference.js` の land fraction table。ETOPO1 と極域氷診断から作った HEALPix セルごとの $0$-$255$ land fraction を使う。 | 陸面率 $f^{land}\in[0,1]$、海洋セル、海岸セル |
| ローカル高解像度海陸 | ETOPO1 標高、極域氷の解析形 | `npm run generate:earth-land -- 128 256` で作る `src/assets/earth-land/land-nside*-u8.bin`。ローカル実験用。 | 陸面率 $0$-$255$ の u8 mask / fraction |
| 標高 | NOAA NGDC ETOPO1 Global Relief Model | `src/assets/earth-elevation/etopo1-1deg-int16.bin` | 1 度格子の標高 $z$、単位 $\mathrm{m}$ |
| 気温 | WorldClim 2.1 BIO1 | `src/assets/earth-climate/worldclim-bio1-bio2-bio12-1deg-int16.bin` band 0 | 年平均気温、$0.1\,^\circ\mathrm{C}$ 単位 |
| 日較差 | WorldClim 2.1 BIO2 | `src/assets/earth-climate/worldclim-bio1-bio2-bio12-1deg-int16.bin` band 1 | 平均日較差、$0.1\,^\circ\mathrm{C}$ 単位 |
| 降水 | WorldClim 2.1 BIO12 | `src/assets/earth-climate/worldclim-bio1-bio2-bio12-1deg-int16.bin` band 2 | 年降水量、$\mathrm{mm\,yr^{-1}}$ |
| 雲量表示 | ERA5 monthly total cloud cover | `public/assets/earth-cloud/era5-total-cloud-cover-monthly-1deg-u8.bin` | 月平均全雲量 $0$-$255$。表示用の低解像度気候参照 |

実データから作る派生量は次である。

| 用途 | 入力 | 派生量 |
| --- | --- | --- |
| 地形勾配・水頭 | ETOPO1 標高、HEALPix RBF-FD | 地表水流向、地下水頭、Darcy 型水平輸送 |
| 標高気温補正 | WorldClim BIO1、ETOPO1 標高 | セル別平均気温、温度ストレス |
| 平均降水・湿潤度 | WorldClim BIO12、地形、水収支 | 降水入力、乾燥・湿潤適性 |
| 植生適性 | 海陸、標高、気温、降水、土壌水分、地下水、養分、日射 | バラ・バオバブの発芽、定着、死亡率 |

土地利用・植生・土壌・水文の参照データを追加する場合は、次を優先する。

| 用途 | 参照データ | 使う値 |
| --- | --- | --- |
| 土地被覆 | ESA WorldCover、または MODIS MCD12Q1 | 森林、草地、裸地、都市、農地、水域 |
| 植生量・季節性 | MODIS NDVI/EVI、または LAI | 初期植生量、季節変化、植生適性の拘束 |
| 土壌条件 | SoilGrids | 土性、保水性、透水性、肥沃度 |
| 湖沼・河川・流域 | HydroLAKES、HydroSHEDS、Natural Earth rivers/lakes | 内陸水域、流向、集水しやすさ |
| 氷床・恒久雪 | Natural Earth、ETOPO1、Randolph Glacier Inventory | 氷床、恒久雪、寒冷裸地 |

これらの専用 asset がまだない量は、手続き的な大陸や主要気候帯ではなく、海陸、標高、WorldClim 気温・降水、土壌水分、地下水、養分から診断する。実データ asset が読めない場合だけ、`src/earth-reference.js` の解析的フォールバックを使う。

## 惑星物性パラメータ

植生・水文シミュレーションで使う惑星物性は、地球モードと小惑星モードで共通にする。小惑星モードは画面上・物語上は小さい庭園惑星として見せるが、物理計算では地球と同じ半径、重力、大気基準値を使う。小半径・低重力の小天体として計算すると、地球植物の光合成、蒸散、水文、土壌パラメータをそのまま使えなくなるため、ここでは「小さい星らしさ」は表示、土地利用、気候境界条件、初期条件、手入れイベントで表す。

基準物性は次の通り。

| 量 | 記号 | 基準値 | 扱い |
| --- | --- | ---: | --- |
| 惑星半径 | $R$ | $6.371\times10^6\,\mathrm{m}$ | 地球・小惑星で共通 |
| 重力加速度 | $g$ | $9.80665\,\mathrm{m\,s^{-2}}$ | 地球・小惑星で共通 |
| 水の密度 | $\rho_w$ | $1000\,\mathrm{kg\,m^{-3}}$ | 水文・水頭計算 |
| 標準気圧 | $p_0$ | $101325\,\mathrm{Pa}$ | 蒸発散・気孔計算の基準 |
| 大気 CO2 | $c_a$ | 物理基準は $420\,\mathrm{\mu mol\,mol^{-1}}$ | 小惑星 UI 既定値は $430\,\mathrm{ppm}$、地球 UI 既定値は $420\,\mathrm{ppm}$ |
| 大気 O2 | $o_a$ | $210000\,\mathrm{\mu mol\,mol^{-1}}$ | 光合成計算 |
| 空気モル体積 | $V_m$ | $0.02445\,\mathrm{m^3\,mol^{-1}}$ | 気孔コンダクタンス変換 |
| 乾湿計定数 | $\gamma$ | $0.066\,\mathrm{kPa\,^\circ C^{-1}}$ | Penman-Monteith 型蒸発散 |
| 参照風速 | $u$ | $1.65\,\mathrm{m\,s^{-1}}$ | 空力コンダクタンス |
| 参照空力コンダクタンス | $g_a$ | $u/208\,\mathrm{m\,s^{-1}}$ | Penman-Monteith 型蒸発散 |

`nside` は HEALPix 解像度であり、惑星サイズを変えない。表示用の球半径は描画スケールであり、次の物理半径 $R$ とは別物である。セル面積と代表セル長は

$$
A_{\mathrm{cell}}=\frac{4\pi R^2}{12n_{\mathrm{side}}^2},
\qquad
L_{\mathrm{cell}}=\sqrt{A_{\mathrm{cell}}}
$$

で定義する。種子散布距離、拡散係数、Darcy 型輸送係数、地形勾配は物理長で評価し、`nside` の変更で物理パラメータそのものを変えない。

したがって、小惑星モードの「小惑星」は物理半径・重力を変更する指定ではない。植生シミュレーションが参照する物性は地球モードと同じであり、地球植物・地球土壌・地球大気を基準にした水文、光合成、蒸発散、種子散布の式をそのまま使う。

小惑星モードで変更する外部条件は、惑星半径・重力そのものではなく、次の気候・境界条件である。

| 外部条件 | 意味 | 小惑星モードでの扱い |
| --- | --- | --- |
| 全球平均気温 | 平均的な生育温度 | UI パラメータとして調整する |
| 日変化振幅 | 昼夜の温度差 | 小惑星の乾燥・裸地性を表す |
| 緯度方向温度差 | 緯度勾配 | 小惑星では地球より弱めにできる |
| 降水強度 | 雨イベントの水入力 | 昼面・局所雲・パッチ状降水として与える |
| 乾燥日頻度 | 雨のない期間 | バラ維持の難しさを決める |
| 蒸発需要 | 大気の乾燥・風の効果 | 水やり後の乾きやすさを決める |
| 1行動の時間倍率 | 行動1回で進む実時間 | 基礎方程式を変えず、水文・植生・炭素・種子を同じ実時間だけ進める |

## 小惑星モード

- 小惑星は地球の縮小版ではなく、表示・物語・土地利用として小さい裸地の庭園惑星として扱う。
- 物理計算上の半径と重力は地球モードと同じにし、植生・水文・炭素・種子の基礎方程式をそのまま使う。
- 地形、火山、灰、水場、夕日観測路、バラの庭、バオバブ監視地、岩地、砂地、苔・小草地は、HEALPix セル上の土地利用・土壌・標高・水収支に結びつける。
- 火山・水場・バラ・飛行機などのオブジェクトは、セル、標高、土地利用、物理場とずれないように置く。
- 小惑星の外部条件として、全球平均気温、日変化振幅、緯度方向の温度差、降水強度、乾燥日頻度、蒸発需要、1行動の時間倍率を調整できる。
- 小惑星モードでは、地形・土地利用・降水パターン・初期植生・手入れイベントを小惑星用に変える。植物生理、水文、炭素、種子の基礎方程式は地球モードと共通にする。
- 小惑星ではバラは特別な一本から始める。自然条件と手入れ次第で増えることはあってよいが、初期から多数配置しない。
- 小惑星のバラは放置で衰退しうる。水やり・灰掃除・気候条件によって維持できる。増殖は維持より難しい。
- 小惑星のバオバブは、乾燥・貧栄養・荒地で残りやすく、湿潤・低温・活火山セルでは不利にする。

## HEALPix と RBF-FD

- HEALPix セルは球面上の離散点として扱う。セル中心、近傍、面形状、投影図、表示オブジェクトを混同しない。
- RBF-FD は球面上の点値計算のために使う。保存型有限体積の代用として扱わない。
- 現在の RBF-FD は 9 点ステンシルを基本にする。
- 接平面上の RBF-FD は、各セル中心の測地法線座標上で scalar field を近似するときに、球面勾配と Laplace-Beltrami の局所点値近似になる。
- 接平面座標は、単なる表示用投影ではなく、セル中心から近傍セルへの log map または同じ微分次数まで一致する局所座標として扱う。
- Laplace-Beltrami を二階微分として使う場合、係数は RBF-poly-FD として作る。polynomial augmentation は少なくとも二次多項式 $1,x,y,x^2,xy,y^2$ を再現する。一次多項式 $1,x,y$ だけでは二階微分として整合しない。
- RBF-FD 重みは局所ステンシル形状ごとに再利用する。回転・反射・近傍順序の違いで本質的に同じ形状は canonical geometry key で同一視する。
- 係数計算は Float64 で行い、評価用の重みは Float32 化してメモリ帯域を抑える。
- Laplacian は回転・反射不変として扱える。gradient は canonical 座標から各セルの east/north 接平面へ変換して使う。
- 対応する事前計算アセットは `src/assets/rbf-fd/operators-nside*.bin`。
- Git 管理する RBF-FD 係数アセットは `nside <= 64` までにする。
- `nside=128,256` の RBF-FD 係数は、ローカル clone 後に必要に応じて `npm run generate:rbf-fd -- 128 256` で作る。
- 公開 web 版では `nside=128,256` を表示・選択対象にしない。

## 現在の時間設定

- 植生・水文モデルの基本時間刻みは `MODEL_DT_DAYS = 3 / 24`、すなわち $0.125\,\mathrm{d}$ である。この 3 時間刻みを

$$
\Delta t_h=\texttt{MODEL\_DT\_DAYS}
$$

と書く。
- UI の 1 日は 8 ターンとして扱う。
- UI の 1 ターンは 3 時間、すなわち `ACTION_DT_DAYS = 0.125` である。
- 1行動の時間倍率は、行動1回で進む実時間を変えるための外部条件であり、植物生理パラメータ自体を書き換えるものではない。実時間は

$$
\Delta t_{\mathrm{action}}
= \texttt{ACTION\_DT\_DAYS}\times\texttt{actionTimeScale}
$$

である。
- 1行動の時間倍率を変えても、基礎方程式と保存関係は変えない。水やり・放水・抜く・掃除・火入れなどの管理行動は、行動期間中に平均的に作用する forcing / tendency として扱う。
- 水文、日射、降水、雪氷、火山灰、燃焼は 3 時間の基礎刻み $\Delta t_h$ で進める。
- 植物炭素、種子、土壌有機物、利用可能無機養分指数の反応は `slowStepInterval` ごとにまとめて更新する。現在は `slowStepInterval = round(1 / modelDtDays)` なので、通常は 1 日ごとに slow step が走る。この slow 系の刻みを

$$
\Delta t_s=\texttt{slowStepInterval}\,\Delta t_h
$$

と書く。炭素、種子、リター、土壌有機物、利用可能無機養分指数の反応式では $\Delta t_s$ を使う。
- slow step では、直前の水文刻みで蓄積した平均環境場、すなわち GPP、根水分ストレス、光制限、植生被覆、表面温度、灰ストレス、湿潤度、上層飽和度、地下水飽和度を使う。
- ローカル開発で `nside >= 128` を使う場合、計算負荷を抑えるため、UI 上の 1行動の時間倍率は $1$ に固定する。

## 現在の水文モデル

- 水は、地表水、土壌 3 層、地下水を持つ。
- 土壌 3 層は上層・中層・下層の根域・浸透・保持を分けるためにある。
- 地表水はセル表面にある薄い水膜・湛水として扱う。
- 地下水は地形と水頭勾配に沿って移動する貯留層として扱う。
- 土壌種は `SUBSTRATES` に定義する。ローム、岩、火山灰、砂、クラストなどがあり、`thetaS`、`thetaR`、van Genuchten `alpha` / `n`、透水係数、地下水係数、層容量、蒸発・根吸水・養分係数を持つ。
- 鉛直方向は van Genuchten 型の水分保持と透水性 lookup を使い、Richards 方程式に近い半陰的な柱モデルとして解く。
- 水平方向は、標高、土壌水頭、地下水頭の勾配を RBF-FD で評価し、Darcy 型の移動として扱う。
- 地表水は標高勾配と水膜勾配に沿う移流拡散として扱う。
- 地表水の陽解法は CFL 条件に従って subcycle する。水量を任意に制限して発散を隠さない。

### 現在の地表水主要定数

- `SURFACE_WATER_DIFF_M2_DAY = 90000`
- 地表水の移動速度は Manning 型の

$$
v=\frac{86400}{n} h^{2/3}\sqrt{S}
$$

で評価し、現在は `SURFACE_MANNING_ROUGHNESS = 0.055` を使う。
- `SURFACE_SLOPE_MAX_VELOCITY_M_DAY = 12000`
- `SURFACE_TRANSPORT_DIFFUSION_CFL = 0.2`
- `SURFACE_TRANSPORT_ADVECTION_CFL = 0.25`
- `SURFACE_FILM_THRESHOLD_M = 0.00025`

## 現在の気候・日射モデル

- 地球の平均気温、日較差、年降水量は WorldClim 由来の値を基本にする。
- 地球の標高効果は ETOPO1 由来の標高を使う。
- 地球の陸上降水は WorldClim BIO12 の実気候値を基本にし、熱帯の局所対流性降水と中緯度の移動性降水帯を時間変化として重ねる。
- 海上降水と WorldClim 欠損セルは、現在は地形・緯度・解析的降水帯から診断する。海上降水を実データ化する場合は ERA5 などの全球降水・雲水量 asset を追加する。
- 小惑星の温度は、全球平均気温、日変化振幅、緯度変化、雲・雨による冷却で決める。
- 小惑星の降水は地球型の大気循環ではなく、昼面・局所雲・パッチ状の雨として扱う。
- 日射は太陽方向、セル法線、日周期から計算する。夜面・日陰側では日射が 0 になる。
- バラ位置を基準に、正午にはバラの地点のほぼ真上に太陽が来るようにする。
- 光合成に使う PAR は日射から計算する。現在の clear-sky PAR スケールは `CLEAR_SKY_PAR_MOL_M2_DAY = 42`。

## 現在の植生・炭素モデル

- 植物はバオバブとバラを別 PFT として扱う。
- バオバブとバラは、それぞれ別の光合成、根吸水、炭素配分、葉面積、種子、死亡・損失パラメータを持つ。
- 光合成は Farquhar / Medlyn 型の簡易 canopy 計算を使う。
- 蒸散・蒸発需要は Penman-Monteith 型の近似を使う。
- 温度応答は lookup 化し、各セルで高コストな指数関数を繰り返し評価しない。
- 炭素プールは、バオバブでは葉・幹・根・貯蔵、バラでは葉・花・根・貯蔵を持つ。
- 種子、速いリター、遅いリター、活性土壌炭素、安定土壌炭素も持つ。
- 炭素収支は `GPP - 維持呼吸 - 成長呼吸 - 損失` を基本にする。
- 炭素不足時は貯蔵炭素を動員する。なお不足が残る場合は葉・花・根・幹の損失として現れる。

## 種子・定着モデル

- 植物体バイオマスをそのまま拡散させない。
- 種 $p\in\{B,R\}$ は、成体炭素 $C^{adult}_{p,i}$、希望種子生産 $P^{seed,desired}_{p,i}$、炭素制約後の実種子生産 $P^{seed,act}_{p,i}$、種子到着量 $A^p_i$、種子バンク $S^p_i$、発芽・定着量 $G^p_i$ を持つ。
- 種子散布カーネル $K^p_{ij}$ は、親セル $j$ から到着セル $i$ への分配率であり、$\sum_i K^p_{ij}=1$ を満たす。
- 種間差は、$p_p$、成熟関数、散布距離 $\ell_p$、種子死亡率 $\mu^p_i$、発芽関数 $r^p_g$、定着後の炭素配分係数に入る。
- 散布距離は物理長で与える。`nside` は解像度であり、惑星半径や種子散布距離そのものではない。
- 種子散布は、現在の1回のゲーム実行では有限個の cohort を確率的に落とす。すなわち、$K^p_{ij}$ は多数回平均した期待値であり、1回の更新では各 cohort が $K^p_{\cdot j}$ に従って1つの到着セルへ落ちる。
- このため、低解像度では種子が親セルに残る試行が多く、外へ出る場合も特定セルへまとまって入る。RBF-FD によるバイオマス拡散や連続的な期待値散布で、全近傍へ薄く同時配分する扱いにはしない。
- バオバブとバラは同じ cohort 型確率散布を使う。成体バイオマス、種子生産、種子散布、種子バンク、発芽、定着の枠組みは共通であり、違いは各 PFT の成熟、生産、散布、死亡、発芽、炭素配分パラメータで表す。

## 現在の養分モデル

- $N_i$ は土壌中の利用可能無機養分指数として扱う。現段階では厳密な窒素質量プールではない。
- 養分は水とともに移動し、土壌炭素への収着、湿潤度、地下水、表層水の影響を受ける。
- 養分更新には、鉱物化、風化、火山灰由来供給、植物吸収、リーチング、RBF-FD 輸送が含まれる。

## 現在の定式化

### 記号

- セルを $i$、近傍ステンシル上のセルを $j$ とする。
- 水文・輸送の基礎時間刻みを $\Delta t_h$、slow 系の反応時間刻みを $\Delta t_s$ とする。
- セル中心の標高を $z_i$、地表水を $H_i$ とする。
- 土壌層を $\ell=0,1,2$ とし、土壌水量を $W_{\ell,i}$、層容量を $C_{\ell,i}$、飽和度を $s_{\ell,i}=W_{\ell,i}/C_{\ell,i}$ とする。
- 地下水貯留を $G_i$、地下水容量を $C^g_i$、地下水飽和度を $s^g_i=G_i/C^g_i$ とする。
- バオバブの葉・幹・根・貯蔵炭素を $B^L_i,B^S_i,B^R_i,B^Q_i$、バラの葉・花・根・貯蔵炭素を $R^L_i,R^F_i,R^R_i,R^Q_i$ とする。
- バオバブ種子バンクを $S^B_i$、バラ種子バンクを $S^R_i$ とする。
- 利用可能無機養分指数を $N_i$、速いリターを $L^f_i$、遅いリターを $L^s_i$、活性土壌炭素を $C^a_i$、安定土壌炭素を $C^s_i$ とする。

### RBF-FD 離散作用素

各セル $i$ の 9 点ステンシル $\mathrm{st}(i,k)$ と重み $w^x_{i,k}, w^y_{i,k}, w^\Delta_{i,k}$ により、

$$
\begin{aligned}
\partial_x f_i &\simeq \sum_k w^x_{i,k} f_{\mathrm{st}(i,k)},\\
\partial_y f_i &\simeq \sum_k w^y_{i,k} f_{\mathrm{st}(i,k)},\\
\Delta f_i &\simeq \sum_k w^\Delta_{i,k} f_{\mathrm{st}(i,k)}.
\end{aligned}
$$

勾配は球面接平面上の east/north 成分として扱う。Laplacian は、球面上の Laplace-Beltrami $\Delta_S$ の点値近似として扱う。

球面演算子として整合させるには、セル $i$ の法線を $\mathbf{n}_i$、近傍セル $j$ の法線を $\mathbf{n}_j$ として、

$$
\theta_{ij}=\arccos(\mathbf{n}_i\cdot\mathbf{n}_j),
\qquad
\mathbf{t}_{ij}
=
\frac{\mathbf{n}_j-\cos\theta_{ij}\mathbf{n}_i}{\sin\theta_{ij}}
$$

を用い、局所座標を

$$
x_{ij}=R\theta_{ij}(\mathbf{t}_{ij}\cdot\mathbf{e}_i),
\qquad
y_{ij}=R\theta_{ij}(\mathbf{t}_{ij}\cdot\mathbf{n}^{north}_i)
$$

のような測地法線座標として作る。ここで $\mathbf{e}_i$ は east 接ベクトル、$\mathbf{n}^{north}_i$ は north 接ベクトルである。この座標では中心点で metric が Euclidean になり、$\Delta_S$ は中心点で平面 Laplacian と一致する。

二階微分を使うため、Laplacian の RBF-FD 重みは少なくとも

$$
\{1,x,y,x^2,xy,y^2\}
$$

を再現する。対応する polynomial RHS は、

$$
\Delta 1=\Delta x=\Delta y=\Delta xy=0,
\qquad
\Delta x^2=\Delta y^2=2.
$$

RBF-poly-FD 係数は、局所点 $\mathbf{x}_j=(x_{ij},y_{ij})$、PHS RBF $\phi(r)=r^5$、多項式基底 $p_m$ に対して、

$$
\begin{bmatrix}
\Phi & P \\
P^\mathsf{T} & 0
\end{bmatrix}
\begin{bmatrix}
\mathbf{w}^{\mathcal L}\\
\boldsymbol{\lambda}
\end{bmatrix}
=
\begin{bmatrix}
\mathcal L\phi(\|\mathbf{0}-\mathbf{x}_j\|)\\
\mathcal L p_m(\mathbf{0})
\end{bmatrix}
$$

で作る。ここで $\Phi_{ab}=\phi(\|\mathbf{x}_a-\mathbf{x}_b\|)$、$P_{am}=p_m(\mathbf{x}_a)$、$\mathcal L$ は $\partial_x$、$\partial_y$、または $\Delta$ である。係数計算は Float64 で行い、事前計算 asset に保存する評価用重みは Float32 とする。

可変係数 Darcy 型輸送では、

$$
\partial_t W
= \nabla\cdot(T\nabla h)
\simeq
T_i \Delta h_i
+ (\partial_x T_i)(\partial_x h_i)
+ (\partial_y T_i)(\partial_y h_i).
$$

を使う。フラックス表記では、

$$
\mathbf{q}=-T\nabla h,\qquad
\partial_t W=-\nabla\cdot\mathbf{q}.
$$

である。

移流拡散型輸送では、

$$
\partial_t c
= D\Delta c-\nabla\cdot(\mathbf{u}c_m),
\qquad
c_m=\max(0,c-c_{\mathrm{threshold}}).
$$

を RBF-FD の勾配・Laplacian で評価する。

### 水分保持と水頭

土壌の有効飽和度 $s$ から van Genuchten 型の水分特性を使う。

$$
\begin{aligned}
m &= 1-\frac{1}{n},\\
\psi(s) &= -\frac{(s^{-1/m}-1)^{1/n}}{\alpha},\\
K(s) &= K_{\mathrm{sat}}K_r(s).
\end{aligned}
$$

$\psi(s)$ と $K_r(s)$ は lookup table 化して評価する。

土壌層の水頭は、

$$
\begin{aligned}
h_{\ell,i} &= z_i-d_{\ell,i}+\psi(s_{\ell,i}),\\
T_{\ell,i} &= K_{\ell,i}b_{\ell,i}.
\end{aligned}
$$

である。$d_\ell$ は層中心深、$b_\ell$ は層厚。

地下水頭と transmissivity は、

$$
\begin{aligned}
h^g_i &= z_i-d^g_i-b^g_i+b^g_i s^g_i,\\
T^g_i &= K^g_i b^g_i\left(0.08+0.92(s^g_i)^{1.7}\right).
\end{aligned}
$$

である。

### 地表水

地表水の移流速度は、地形と水膜から作る水面高

$$
\eta_i=z_i+H_i
$$

の下り方向で決める。低解像度 HEALPix で単一方向へ流しすぎないため、現在の実装は 9 点ステンシル上の downhill 成分を集める MFD 的な点値勾配を使う。

$$
\begin{aligned}
d^x_i &= \sum_{j\in\mathrm{st}(i)} w^x_{ij}\max(0,\eta_i-\eta_j),\\
d^y_i &= \sum_{j\in\mathrm{st}(i)} w^y_{ij}\max(0,\eta_i-\eta_j).
\end{aligned}
$$

移動度は Manning 型の水深依存速度で評価する。下り成分の大きさを

$$
S_i=\sqrt{(d^x_i)^2+(d^y_i)^2}
$$

とし、動く水深を

$$
h^m_i=\max(5.0\times10^{-4},H_i-H_f)
$$

とする。$S_i>0$ かつ $H_i>H_f$ のとき、速度の大きさは

$$
\left|\mathbf{u}^H_i\right|
=
\min\left[
u^H_{\max},
\frac{86400}{n_M}
\left(h^m_i\right)^{2/3}
\sqrt{S_i}
\right].
$$

地表水速度は

$$
\mathbf{u}^H_i
=
\frac{\left|\mathbf{u}^H_i\right|}{S_i}
(d^x_i,d^y_i)
$$

である。$S_i=0$ または $H_i\le H_f$ の場合は $\mathbf{u}^H_i=\mathbf{0}$ とする。$H_f$ は動かない薄膜のしきい値。

地表水の水平輸送は、

$$
\partial_t H_i
= D_H\Delta H_i
- \nabla\cdot\left(\mathbf{u}^H_i\max(0,H_i-H_f)\right).
$$

である。実装上は RBF-FD の勾配重みにより $\mathbf{u}^H H_{\mathrm{mobile}}$ の発散を評価する。

水文更新では、降雨・樹冠通過雨・浸透・地表蒸発を含めて、

$$
H_i^{n+1}
= H_i^n
+ \Delta t_h\left(T^H_i+P_i^{\mathrm{through}}-I_i-E^H_i\right).
$$

とする。$T^H_i$ は上の水平輸送項。

陽的な地表水輸送は、

$$
\Delta t_{\mathrm{sub}}
\le
\frac{C_{\mathrm{diff}}\Delta x^2}{D_H},
\qquad
\Delta t_{\mathrm{sub}}
\le
\frac{C_{\mathrm{adv}}\Delta x}{u^H_{\max}}.
$$

を満たすように subcycle する。

### 鉛直浸透・土壌水・地下水

地表から上層土壌への浸透は、

$$
I_i
= \min\left[
\frac{H_i}{\Delta t_h}+P_i^{\mathrm{through}},
\frac{C_{0,i}-W_{0,i}}{\Delta t_h},
K^I_i
\max\left(0,\frac{z_i+H_i-h_{0,i}}{d^I_i}\right)
O_i
\right].
$$

である。$O_i$ は空隙率に対応する開口率。

層間フラックスは水頭差で決める。

$$
\begin{aligned}
q_{01,i} &= K^h_{01,i}p_i\frac{h_{0,i}-h_{1,i}}{d_{01,i}},\\
q_{12,i} &= K^h_{12,i}p_i\frac{h_{1,i}-h_{2,i}}{d_{12,i}},\\
q_{2g,i} &= K^h_{2g,i}p_i\frac{h_{2,i}-h^g_i}{d_{2g,i}}.
\end{aligned}
$$

$K^h$ は隣接する層の透水係数の harmonic mean、$p_i$ は土壌種ごとの percolation 係数。

土壌水の更新は、

$$
\begin{aligned}
W_{0,i}^{n+1}
&= W_{0,i}^{n}
+ \Delta t_h\left(T^W_{0,i}+I_i-q_{01,i}-U_{0,i}-E^S_i\right),\\
W_{1,i}^{n+1}
&= W_{1,i}^{n}
+ \Delta t_h\left(T^W_{1,i}+q_{01,i}-q_{12,i}-U_{1,i}\right),\\
W_{2,i}^{n+1}
&= W_{2,i}^{n}
+ \Delta t_h\left(T^W_{2,i}+q_{12,i}-q_{2g,i}-U_{2,i}\right).
\end{aligned}
$$

である。$T^W_\ell=\nabla\cdot(T_\ell\nabla h_\ell)$ は水平方向の土壌水輸送、$U_\ell$ は根吸水、$E^S$ は土壌蒸発。

地下水は、

$$
G_i^{n+1}
= G_i^n+\Delta t_h\left(T^g_i+q_{2g,i}-L_i-U^g_i\right).
$$

である。$T^g_i=\nabla\cdot(T^g\nabla h^g)_i$ は地下水水平輸送、$L_i$ は深部漏出、$U^g_i$ は地下水からの根吸水。

### 樹冠遮断と蒸発散

LAI から樹冠遮断率を決める。

$$
\begin{aligned}
f_{\mathrm{int}} &= 1-\exp(-0.42\,LAI),\\
C_{\mathrm{canopy}}^{n+1}
&= C_{\mathrm{canopy}}^n
+ \Delta t_h\left(I^{can}-E_{\mathrm{canopy}}\right),\\
P_{\mathrm{through}} &= P-I^{can}.
\end{aligned}
$$

実捕捉量 $I^{can}$ は canopy storage 容量を超えないように制限する。

$$
I^{can}
=
\min\left[
P f_{\mathrm{int}},
\max\left(
0,
\frac{C^{max}_{\mathrm{canopy}}-C_{\mathrm{canopy}}}{\Delta t_h}
+E_{\mathrm{canopy}}
\right)
\right].
$$

樹冠蒸発も、当期に利用できる樹冠水を超えない。

$$
E^{act}_{\mathrm{canopy}}
\le
\frac{C_{\mathrm{canopy}}}{\Delta t_h}+
I^{can}.
$$

蒸発散需要は Penman-Monteith 型の近似で求める。

$$
ET_0 = PM(R_n,T,VPD,g_a,g_s).
$$

樹冠蒸発、土壌蒸発、植物蒸散は `ET0`、LAI、気孔コンダクタンス、水分状態から分配する。

根吸水は層ごとの根分布、層水ポテンシャル、透水性、植物水ポテンシャルで分ける。

$$
U_{p,\ell}
=
\max\left[
0,
G^{root}_{p,\ell}
\left(\psi_{\ell,i}-\psi^{\mathrm{plant}}_p\right)
\right]
\qquad
\left[G^{root}_{p,\ell}\right]=\mathrm{day^{-1}},
\qquad
\sum_{\ell=0}^{2}U_{p,\ell}+U^g_p\le Demand_p.
$$

$G^{root}_{p,\ell}$ は根分布 $f^{root}_{p,\ell}$、層透水性 $K_{\ell,i}$、層ストレス $S_{p,\ell}$、有効経路長をまとめた根水理コンダクタンスである。$p$ はバオバブまたはバラ。現在の実装では、地下水吸水 $U^g_p$ はバオバブだけが使い、バラでは $U^g_R=0$ とする。

植物体内の水貯留は明示的に持たないので、実蒸散は実際に根・地下水から吸えた量に等しい。

$$
Transpiration^{act}_{p,i}
=
\sum_{\ell=0}^2 U_{p,\ell,i}+U^g_{p,i}.
$$

潜在蒸散需要がこれを上回る場合は、水供給側に合わせて根水分ストレスと気孔コンダクタンスを下げる。

### 日射・LAI・APAR

各植物の LAI は、

$$
\begin{aligned}
LAI_B &= SLA_B B^L,\\
LAI_R &= SLA_R R^L + SLA^F_R R^F.
\end{aligned}
$$

である。

吸収光量は Beer-Lambert 型で、

$$
\begin{aligned}
\tau_i &= k_B LAI_{B,i}+k_R LAI_{R,i},\\
APAR_i &= PAR_i\left(1-\exp(-\tau_i)\right),\\
APAR_{B,i} &= APAR_i\frac{k_B LAI_{B,i}}{\tau_i},\\
APAR_{R,i} &= APAR_i\frac{k_R LAI_{R,i}}{\tau_i}.
\end{aligned}
$$

$\tau_i=0$ の場合は $APAR_i=APAR_{B,i}=APAR_{R,i}=0$ とする。現在の実装では、バラの花面積も簡略化して $LAI_R$ に含め、遮光と吸収光配分の両方へ入れている。より厳密には、花は PAI として遮光には入れ、GPP に使う光合成葉面積からは分ける。

被覆率は、

$$
Cover_i = 1-\exp(-\tau_i).
$$

である。

### 光合成・呼吸・炭素収支

光合成は Farquhar / Medlyn 型の canopy 計算を簡略化して使う。

$$
\begin{aligned}
A_g &= \min(W_c,W_j),\\
VPD^* &= \max(VPD,VPD_{\min}),\\
A_n^+ &= \max(0,A_g),\\
g_s &= g_0+1.6\left(1+\frac{g_1}{\sqrt{VPD^*}}\right)\frac{A_n^+}{C_a},\\
GPP_p &= F\left(APAR_p,V_{c\max,p}(T),J_{\max,p}(T),C_i,g_s,water_p,nutrient_p,CO_2\right).
\end{aligned}
$$

$p$ はバオバブまたはバラ。温度応答 $V_{c\max}(T), J_{\max}(T)$ は lookup 化する。実装で炭素プールへ入れる `GPP` は $R_d$ 控除後の純同化ではなく、$A_g$ に基づく総同化である。葉・花・根・幹・貯蔵の維持呼吸は後段の $R^m_p$ にまとめる。

診断用の light-use-efficiency GPP は、

$$
GPP^{LUE}_p
= APAR_p\epsilon_p f_T f_W f_{VPD} f_{CO_2} f_N.
$$

として併記するが、炭素プール更新には Farquhar 型の $GPP_p$ を使う。

維持呼吸は、

$$
\begin{aligned}
R^m_B
&= Q10_B(T)\left(m^L_B B^L+m^S_B B^S+m^R_B B^R+m^Q_B B^Q\right),\\
R^m_R
&= Q10_R(T)\left(m^L_R R^L+m^F_R R^F+m^R_R R^R+m^Q_R R^Q\right).
\end{aligned}
$$

成長呼吸と炭素収支は、

$$
\begin{aligned}
A_p &= GPP_p-R^m_p,\\
R^g_p &= \max(0,A_p)r^g_p,\\
NPP_p &= \max(0,A_p-R^g_p),\\
Cbal_p &=
\begin{cases}
NPP_p, & A_p>0,\\
A_p, & A_p\le 0.
\end{cases}
\end{aligned}
$$

である。

炭素不足時は貯蔵炭素を動員する。

$$
\begin{aligned}
D_p &= \max(0,-Cbal_p),\\
M_p &= \min\left(\frac{Q_p}{\Delta t_s},D_p m^{store}_p\right),\\
D^{unmet}_p &= \max(0,D_p-M_p),\\
C^{cat}_p &= \min\left(D^{unmet}_p,\frac{C^{struct}_p}{\Delta t_s}\right),\\
D^{res}_p &= \max(0,D^{unmet}_p-C^{cat}_p),\\
R^{m,act}_p &= \max(0,R^{m,pot}_p-D^{res}_p).
\end{aligned}
$$

$C^{cat}_p$ は葉・花・根・幹などの構造炭素を維持呼吸の基質として直接消費する量であり、リターには入れず大気への自養呼吸として扱う。$D^{res}_p$ が残る場合、支払えなかった維持呼吸として実効維持呼吸 $R^{m,act}_p$ を下げ、同時に starvation として損失率を増やす。

自養呼吸は、

$$
R^{auto}_p
=
R^{m,act}_p+R^g_p+R^{germ}_p.
$$

$M_p$ と $C^{cat}_p$ は維持呼吸を支払う炭素源であり、$R^{auto}$ へ別項として足さない。

### 植物炭素プール

正の炭素収支は、種子生産、貯蔵、構造プールへ配分する。実際に種子へ回せる炭素は、まず当期の正の炭素収支から取り、不足分だけ貯蔵炭素から補う。

$$
\begin{aligned}
C^+_p &= \max(0,Cbal_p),\\
P^{seed,act}_p
&=
\min\left[
P^{seed,desired}_p,
f^{seed,N}_p C^+_p
+f^{seed,Q}_p\frac{\max(0,Q_p-Q^{min}_p)}{\Delta t_s}
\right],\\
P^{seed,N}_p &= \min(f^{seed,N}_pC^+_p,P^{seed,act}_p),\\
P^{seed,Q}_p &= \min\left(\max(0,P^{seed,act}_p-P^{seed,N}_p),\frac{\max(0,Q_p-Q^{min}_p)}{\Delta t_s}\right),\\
C^{veg,+}_p &= C^+_p-P^{seed,N}_p,\\
A^Q_p &= f^Q_p C^{veg,+}_p,\\
G_p &= C^{veg,+}_p-A^Q_p.
\end{aligned}
$$

散布へ渡す種子量は希望生産量 $P^{seed,desired}_p$ ではなく、炭素で支払えた実生産量 $P^{seed,act}_p$ である。

バオバブは、

$$
\begin{aligned}
(B^L)^{n+1}
&= B^L+\Delta t_s\left(a^L_B G_B+G^{seed,L}_B-Loss^L_B-C^{cat,L}_B\right),\\
(B^S)^{n+1}
&= B^S+\Delta t_s\left(a^S_B G_B+G^{seed,S}_B-Loss^S_B-C^{cat,S}_B\right),\\
(B^R)^{n+1}
&= B^R+\Delta t_s\left(a^R_B G_B+G^{seed,R}_B-Loss^R_B-C^{cat,R}_B\right),\\
(B^Q)^{n+1}
&= B^Q+\Delta t_s\left(A^Q_B-M_B-P^{seed,Q}_B\right).
\end{aligned}
$$

である。

バラは、

$$
\begin{aligned}
(R^L)^{n+1}
&= R^L+\Delta t_s\left(a^L_R G_R+G^{seed,L}_R-Loss^L_R-C^{cat,L}_R\right),\\
(R^F)^{n+1}
&= R^F+\Delta t_s\left(a^F_R G_R+G^{seed,F}_R-Loss^F_R-C^{cat,F}_R\right),\\
(R^R)^{n+1}
&= R^R+\Delta t_s\left(a^R_R G_R+G^{seed,R}_R-Loss^R_R-C^{cat,R}_R\right),\\
(R^Q)^{n+1}
&= R^Q+\Delta t_s\left(A^Q_R-M_R-P^{seed,Q}_R\right).
\end{aligned}
$$

である。

損失率は、基本 turnover、乾燥、遮光、灰、死亡率、starvation の和として扱う。

$$
Loss^x_p
= C^x_p\lambda^x_p(stress,light,ash,mortality,starvation).
$$

同じ構造炭素プールから同時に出る turnover 損失と異化消費は、合計が当期に利用できるプール量を超えないように共同で制限する。

$$
Loss^{x,act}_p+C^{cat,x,act}_p
\le
\frac{C^x_p}{\Delta t_s}.
$$

超える場合は、$Loss^x_p$ と $C^{cat,x}_p$ を同じ比率で縮小する。turnover 損失はリターへ入り、異化消費は維持呼吸不足を補う大気側の炭素流出として扱う。

### 種子生産・散布・発芽

種 $p\in\{B,R\}$ は、成体炭素、種子生産、種子バンク、発芽、定着、死亡を持つ同じ基本構造で扱う。$B$ はバオバブ、$R$ はバラである。

成体炭素から種子を生産する。

$$
P^{seed,desired}_{p,i}
= p_p C^{adult}_{p,i}
maturity_p(C^{adult}_{p,i})
f^{repr}_p
f^{env}_{p,i}.
$$

$f^{repr}_p$ は花・幹など繁殖器官の成熟度、$f^{env}_{p,i}$ は水分、温度、日射、栄養、土壌、灰による繁殖制限を表す。
炭素制約をかけた後の実生産量を $P^{seed,act}_{p,i}$ とし、散布へ渡す種子量にはこの実生産量を使う。

親セル $j$ で生産された種子は、種ごとの距離カーネル $K^p_{ij}$ でセル $i$ へ到着する。

$$
A^p_i=\sum_j K^p_{ij}P^{seed,act}_{p,j},
\qquad
\sum_i K^p_{ij}=1.
$$

距離カーネルは、例えば次のように置ける。

$$
K^p_{ij}
=
\frac{\exp(-d_{ij}/\ell_p)}
{\sum_{m\in\Omega_j}\exp(-d_{mj}/\ell_p)},
\qquad
\Omega_j=\{j\}\cup\mathcal{N}(j).
$$

stochastic cohort を使う場合も同じカーネルからサンプルし、期待値として同じ保存条件を満たす。

$$
A^p_i
=
\sum_j\sum_{\mathrm{cohort}}
\frac{P^{seed,act}_{p,j}}{N_{\mathrm{cohort}}}
X^p_{j\to i},
\qquad
\mathbb{E}[X^p_{j\to i}]=K^p_{ij}.
$$

現在の実装では、バラとバオバブは同じ種子散布フレームを使う。成体が作った種子は確率的 cohort として距離カーネルで到着フラックス $A^p_i$ に入り、種子バンクは、

$$
\begin{aligned}
(S^B_i)^{n+1}
&= S^B_i+\Delta t_s\left(A^B_i-G^B_i-\mu^B_iS^B_i\right),\\
(S^R_i)^{n+1}
&= S^R_i+\Delta t_s\left(A^R_i-G^R_i-\mu^R_iS^R_i\right).
\end{aligned}
$$

現在の公開実装では、両種とも HEALPix セル中心距離に基づく同じ隣接カーネルを使う。これは未解像の散布過程を、親セルと隣接セルへの確率的なセル間遷移として粗視化したモデルである。種間差は、種子生産率、成熟条件、貯蔵炭素制限、種子死亡率、発芽 readiness、水分・温度・日射・土壌・灰応答、定着後の炭素配分で表す。

発芽・定着は、種子バンク、有効水分、温度、日射、土壌、灰、空き地で決まる。

$$
\begin{aligned}
G^p_i
&= S^{p,\mathrm{eff}}_i
r^p_g(wetness_i,T_i,light_i,soil_i,ash_i,open_i,readiness_i),\\
open_i &= \max(0,1-Cover_i).
\end{aligned}
$$

発芽した種子炭素は、実生組織、発芽呼吸、失敗定着リターへ分ける。

$$
\sum_x e^x_p+f^{germ,resp}_p+f^{failed}_p=1.
$$

$$
\begin{aligned}
G^{seed,x}_p &= e^x_pG^p,\\
R^{germ}_p &= f^{germ,resp}_pG^p,\\
L^{failed}_p &= f^{failed}_pG^p.
\end{aligned}
$$

$G^{seed,x}_p$ は実生の葉・花・幹・根へ入り、$R^{germ}_p$ は自養呼吸、$L^{failed}_p$ は速いリター入力として扱う。

### リター・土壌炭素

植物損失と失敗した定着はリターへ入る。

$$
\begin{aligned}
Input^f_i &= Litter^f_B+Litter^f_R+SeedDeath+FailedSeed,\\
Input^s_i &= Litter^s_B+Litter^s_R.
\end{aligned}
$$

分解は水分・温度・土壌種・灰で変わる。

$$
\begin{aligned}
k_{\ell,i} &= k_\ell(wetness_i,T_i,substrate_i,ash_i),\\
D^f_i &= 1.42\,k_{\ell,i}L^f_i,\\
D^s_i &= 0.32\,k_{\ell,i}L^s_i,\\
Hum_i &= h(D^f_i+D^s_i).
\end{aligned}
$$

リターと土壌炭素は、

$$
\begin{aligned}
(L^f_i)^{n+1}
&= L^f_i+\Delta t_s(Input^f_i-D^f_i),\\
(L^s_i)^{n+1}
&= L^s_i+\Delta t_s(Input^s_i-D^s_i),\\
(C^a_i)^{n+1}
&= C^a_i+\Delta t_s(Hum_i-D^a_i),\\
(C^s_i)^{n+1}
&= C^s_i+\Delta t_s(Stab_i-D^{soc}_i).
\end{aligned}
$$

である。

土壌呼吸は、

$$
R^{soil}_i
= (D^f_i+D^s_i-Hum_i)+(D^a_i-Stab_i)+D^{soc}_i.
$$

である。

### 利用可能無機養分指数

利用可能無機養分指数の輸送は水の速度場に従う移流拡散型として扱う。

$$
\left.\partial_t N_i\right|_{\mathrm{transport}}
= D_N\Delta N_i
-\nabla\cdot(\mathbf{u}^N_i N^{mobile}_i).
$$

水に乗った輸送は水文刻みで適用する。

$$
N_i^\star
=
N_i^n
+\sum_{\Delta t_h\in\Delta t_s}\Delta t_h\,T^N_i.
$$

slow step では、輸送後の $N_i^\star$ に反応項を加える。

$$
N_i^{n+1}
=
N_i^\star+\Delta t_s\left(
S^N_i
-Uptake^{act}_i
-Leaching^{act}_i
\right),
$$

$$
S^N_i
=0.38\,Mineralization_i
+OrganicRelease_i
+MineralWeathering_i
+AshWeathering_i.
$$

植物吸収は GPP に比例する形で、

$$
Uptake^{demand}_i
= u_B\max(0,GPP_B)+u_R\max(0,GPP_R).
$$

を使う。ただし、実際の吸収は利用可能無機養分指数と当期供給で支払える量を超えない。

$$
\begin{aligned}
\mathcal{A}^N_i
&=
\frac{\max(0,N_i^\star-N^{min})}{\Delta t_s}
+\max(0,S^N_i),\\
Uptake^{act}_i+Leaching^{act}_i
&\le \mathcal{A}^N_i.
\end{aligned}
$$

実装では、需要量 $Uptake^{demand}_i$ と leaching 需要の合計が $\mathcal{A}^N_i$ を超える場合、両者を同じ比率で縮小する。

`0.38` は分解炭素から無機養分指数へ換算する現在の簡略係数である。より厳密な窒素質量モデルへ進める場合は、有機養分プールと C:N 比を明示する。

リーチングは、湿潤度と mobile fraction に依存する。

$$
Leaching_i
= (a+b\,wetness_i^2)N_i f_{\mathrm{mobile}}(s_0,s_g,C^a,C^s).
$$

### 雪氷・凍結

- 雪氷は液体水とは別の内部水プールとして扱う。
- 地球モードでは、気温と日較差から降水の雪比率を決め、雪・氷として蓄える。
- 小惑星モードでは、地表水が $0\,^\circ\mathrm{C}$ 以下の表面で凍結し、正の degree-day があると融けて地表水へ戻る。
- 火口セルは凍らない。
- 保水地や海では海氷・水面氷として扱う。
- 雪氷は液体水を減らし、バラとバオバブの葉・花・根・貯蔵・種子へ凍結損傷を与える。解けた後は残った種子や地下部・貯蔵炭素から回復しうる。
- 掃除行動は雪氷を外部へ取り除く管理行動として扱う。

### 管理行動・撹乱

- 水やりと放水は、行動期間中に平均的に加わる水 forcing として扱う。
- 水やりは選択セルへ局所的に作用する。
- 放水は選択セルを中心に周囲へ重み付きで作用し、地表水・土壌水・火の冷却へ効く。
- 抜く、掃除、火入れは、絶対値を瞬時に置き換えるのではなく、作業量または燃焼状態に基づく tendency として作用する。
- 抜くはバオバブ成体・種子を対象にし、除去された炭素は closure として土壌炭素側へ戻す。
- 灰掃除は灰を減らし、掃除した灰由来の炭素を土壌側へ戻す。
- 火入れは燃焼状態、燃料、燃焼強度を持つ。燃焼中に種子・成体炭素を消費し、灰を時間的・空間的に周囲へ飛ばす。
- 雨と放水は火を弱める、または消す。
- 小惑星の主バラセルには直接火をつけない。地球のバラは通常の植物として燃焼対象になり、バオバブより短い時間スケールで燃えうる。
- 羊を飼う行動は地球モードだけで使う。羊は管理 action で作られるが、その後は時間積分に従う移動粒子として更新する。

### 放牧粒子

羊 $q$ は球面上の粒子位置 $\mathbf{x}_q$、現在セル $c_q$、記憶場 $M^q_i$、内部エネルギー $E_q$、累積採食量 $F_q$ を持つ。セル判定は HEALPix セル中心とリングから行う。

$$
c_q(t)=\operatorname{cell}(\mathbf{x}_q(t)).
$$

羊は地球モードの陸上セルだけを移動できる。水域・海岸セルは移動候補から外すため、隣接セルを通って海を渡ることはできない。

採食対象は若い芽に限る。表示用アイコンの大きさではなく、葉・花・若い幹・貯蔵炭素から可食炭素を定義する。バオバブ、バラの総植物炭素をそれぞれ $C^B_i,C^R_i$ とし、しきい値 $C^{B,g}_{\max},C^{R,g}_{\max}$ 以下の若い個体だけを可食対象にする。

$$
\begin{aligned}
C^{edible}_{B,i}
&=B^L_i+0.35B^S_i+0.08B^Q_i,\\
C^{edible}_{R,i}
&=R^L_i+0.55R^F_i+0.06R^Q_i,\\
G^B_i &= C^{edible}_{B,i}\,\mathbf{1}\left(C^B_{\min}<C^B_i\le C^{B,g}_{\max}\right),\\
G^R_i &= C^{edible}_{R,i}\,\mathbf{1}\left(0<C^R_i\le C^{R,g}_{\max}\right).
\end{aligned}
$$

羊がセル $i$ で行う採食作業量は、日数 $\Delta t$ に対して

$$
W^q_i = w^q_{\mathrm{graze}}\Delta t
$$

である。実装ではバオバブの若芽を先に摘み、残った作業量でバラの若芽を摘む。除去された植物炭素を $C^{eat}_{q,i}$ とすると、その一部は近傍セル $d_q(i)$ のリター・土壌側へ戻り、利用可能無機養分指数も増える。

$$
\begin{aligned}
\Delta C^{soil}_{d_q(i)} &= f^C_{\mathrm{dung}} C^{eat}_{q,i},\\
\Delta N_{d_q(i)} &= f^N_{\mathrm{dung}} C^{eat}_{q,i},\\
C^{resp}_{q,i} &= f^C_{\mathrm{resp}} C^{eat}_{q,i},\\
C^{body}_{q,i} &= f^C_{\mathrm{body}} C^{eat}_{q,i}.
\end{aligned}
$$

炭素分配率は、

$$
f^C_{\mathrm{dung}}
+f^C_{\mathrm{resp}}
+f^C_{\mathrm{body}}
+f^C_{\mathrm{export}}
=1.
$$

羊の体炭素は追跡対象の生態系炭素プールに含めない。したがって、土壌へ戻らない分、すなわち呼吸、体内保持、ゲーム外への輸送は外部項として扱う。

$$
D^{sheep}_{q,i}
= \left(1-f^C_{\mathrm{dung}}\right)C^{eat}_{q,i}.
$$

羊の内部エネルギーは、採食で増え、維持コストで減る。

$$
E_q^{n+1}
=
\min\left(E_{\max},E_q^n+\alpha_q C^{eat}_{q}-m_q\Delta t\right).
$$

$E_q\le0$ になった羊は放牧粒子から除く。維持コストは小さく、餌が一時的に見つからなくてもすぐには消えない。

羊の移動は、単純な等確率ランダムウォークではなく、非定常な softmax 方策で決める。現在セルと隣接セルを一歩候補 $\mathcal{C}_q$ とし、候補セル $k$ の効用を

$$
U^q_k
=
V^{local}_k
+\lambda_{\mathrm{look}}V^{look}_k
+\lambda_M M^q_k
-P^{fire}_k
-P^{wet}_k
-P^{trail}_{q,k}
$$

とする。局所可食価値は

$$
V^{local}_k
=
a_B G^B_k+a_R G^R_k.
$$

$V^{look}_k$ は $k$ から数リング以内の陸上セルを見た先読み価値で、距離リング $r$ に対して指数的に減衰する。

$$
V^{look}_k
=
\max_{j\in\mathcal{N}_{R_q}(k)}
\left[
\exp(-\beta_q r_{kj})\max(0,V^{local}_j+\lambda_M M^q_j-P^{fire}_j-P^{wet}_j)
\right]
+\eta_q
\sum_{j\in\mathcal{N}_{R_q}(k)}
\exp(-\beta_q r_{kj})\max(0,V^{local}_j+\lambda_M M^q_j-P^{fire}_j-P^{wet}_j).
$$

ここで $\mathcal{N}_{R_q}(k)$ は $R_q$ リング以内の陸上セルである。火があるセル、過湿なセル、最近通ったばかりで餌がなかったセルはペナルティを受ける。

次のセルは

$$
\Pr(c_q^{n+1}=k)
=
\frac{\exp(U^q_k/\tau_q)}
{\sum_{m\in\mathcal{C}_q}\exp(U^q_m/\tau_q)}
$$

で選ぶ。採食後は、そのセルの記憶を報酬 $C^{eat}_{q,i}$ に向けて更新し、時間とともに忘却する。

$$
\begin{aligned}
M^q_i &\leftarrow
M^q_i+\gamma_q\left(\min(M_{\max},s_q C^{eat}_{q,i})-M^q_i\right),\\
\frac{dM^q_i}{dt} &=-\mu^M_q M^q_i.
\end{aligned}
$$

このため、羊は時々揺らぎを持ちながら、若い芽があった場所やその周辺へ寄りやすくなる。ただし環境と植生分布は時間変化するので、記憶は固定地図ではなく減衰する経験として扱う。

### 保存される量

閉じた球面上の水平輸送は、領域外への境界流出を持たない。したがって、地表水、土壌水、地下水、種子、利用可能無機養分指数の水平輸送項は、全球和では総量を変えない。

$$
\begin{aligned}
\sum_i T^H_i &= 0,\\
\sum_i T^W_{\ell,i} &= 0,\\
\sum_i T^g_i &= 0,\\
\sum_i T^{seed}_i &= 0,\\
\sum_i T^N_i &= 0.
\end{aligned}
$$

RBF-FD は点値法なので完全な有限体積保存形ではないが、方程式としては上の保存関係を満たす輸送として扱う。ずれが大きい場合は、物理を変えるのではなく離散化・時間刻み・係数・丸めを直す。

水について保存される内部量は、地表水、土壌 3 層、地下水、樹冠水、雪氷の合計である。

$$
S^W_i
= H_i+W_{0,i}+W_{1,i}+W_{2,i}+G_i+C^{canopy}_i+I^{snow}_i.
$$

鉛直浸透、層間浸透、地下水涵養、樹冠遮断、凍結、融解は水を別の内部プールへ移すだけで、全球水量を変えない。

$$
I_i,\ q_{01,i},\ q_{12,i},\ q_{2g,i},\ P_i f_{\mathrm{int}},\ F_i,\ M_i
\quad\text{は内部移動。}
$$

全球水量を変える外部入出力は、降水、管理による水入力、樹冠蒸発、土壌蒸発、植物蒸散、深部漏出、雪氷掃除である。

$$
\frac{d}{dt}\sum_i S^W_i
=
\sum_i
\left(
P_i
+W^{management}_i
-E^{canopy}_i
-E^S_i
-E^H_i
-Transpiration^{act}_i
-L_i
-C^{snow}_i
\right).
$$

炭素について保存される内部量は、植物体、種子、リター、土壌有機炭素の合計である。

$$
\begin{aligned}
C^{plant}_i
&= B^L_i+B^S_i+B^R_i+B^Q_i+R^L_i+R^F_i+R^R_i+R^Q_i,\\
C^{seed}_i &= S^B_i+S^R_i,\\
C^{soil}_i &= L^f_i+L^s_i+C^a_i+C^s_i,\\
C^{eco}_i &= C^{plant}_i+C^{seed}_i+C^{soil}_i.
\end{aligned}
$$

植物体からリター、種子から実生、リターから土壌有機炭素への移動は、炭素を別の内部プールへ移すだけである。

$$
Loss_p,\ G^{seed}_p,\ Hum_i,\ Stab_i
\quad\text{は内部炭素移動。}
$$

生態系炭素を変える外部入出力は、大気からの光合成入力、大気への自養呼吸・土壌呼吸、深部・外部への損失、明示的な撹乱である。抜く、火入れ、灰掃除、放牧は撹乱または管理 closure として $D^{external}$ に入る。燃焼、除去、採食の一部を土壌炭素へ戻す場合、その分は内部移動として扱い、大気または外部へ出した分だけを外部損失に数える。現在の羊は生態系炭素プールには含めず、採食した炭素のうち土壌へ戻らない分を $D^{sheep}$ として扱う。

$$
\frac{d}{dt}\sum_i C^{eco}_i
=
\sum_i
\left(
GPP_{B,i}+GPP_{R,i}
-R^{auto}_{B,i}
-R^{auto}_{R,i}
-R^{soil}_i
-D^{external}_i
\right).
$$

種子については、散布は内部移動であり、全球の種子炭素を変えない。種子生産、発芽、死亡は種子プールを変えるが、種子生産と発芽は植物体・種子間の内部炭素移動である。

$$
\frac{d}{dt}\sum_i S^B_i
=
\sum_i(A^B_i-G^B_i-\mu^B_iS^B_i).
$$

$$
\frac{d}{dt}\sum_i S^R_i
=
\sum_i(A^R_i-G^R_i-\mu^R_iS^R_i).
$$

ここで

$$
\sum_i A^p_i=\sum_i P^{seed,act}_{p,i}
$$

であることが、種子散布の保存条件である。stochastic cohort 版では各実現ごとの丸め誤差を除き、cohort の質量を到着セルへ全量配ることで同じ保存条件を満たす。

利用可能無機養分指数は単独では保存量ではない。鉱物化・有機窒素放出・風化・火山灰風化・放牧糞由来の還元はこの指数への入力、植物吸収・リーチングはこの指数からの出力である。水平輸送だけは全球和を変えない。

$$
\frac{d}{dt}\sum_i N_i
=
\sum_i
\left(
0.38\,Mineralization_i
+OrganicRelease_i
+MineralWeathering_i
+AshWeathering_i
+N^{sheep}_i
-Uptake^{act}_i
-Leaching_i
\right).
$$

## 土地利用・オブジェクト

- 土地利用は物理場と矛盾しないように決める。
- 小惑星の火山は標高ピーク、火山灰、乾燥、岩質土壌、水流方向に影響する。
- 活火山は灰を増やす。休火山は既存の灰を持っていてもよいが、時間とともに灰を増やさない。
- 水場は低地・水収束・湿潤土壌と対応する。
- 夕日観測路は土地利用として見えるが、植生や水文の実体と混同しない。
- 羊は土地利用ではなく、地球モードの陸上を移動する粒子オブジェクトとして表示する。
- スカラー場表示では、火山・池・草・飛行機・羊などの装飾オブジェクトを重ねない。
- バラが 0 になったセルを「バラの庭土」と呼ばない。土壌としてはローム等の通常名へ戻す。

## 表示とゲーム性

- 物理シミュレーションの詳細値は内部情報として保持する。
- 通常表示はゲームとして読める要約にする。
- 詳細な水・炭素・養分・日射・温度・収支は、観察時の詳細表示に分離する。
- 選択セルの状態は色を塗り替えて隠さず、輪郭やリングで示す。
- プレイヤーが画面上の情報から判断できるように、バラの衰退、乾燥、灰、日射不足、温度不適、養分不足は要約として伝える。
