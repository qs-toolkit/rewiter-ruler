# 轻启规则合集

轻启·分流器的多应用规则合集。统一维护各应用的域名拒绝、重写与响应脚本，自动生成合集、应用分包和连接配置。

**合集入口：[QuietStart.plugin](https://raw.githubusercontent.com/qs-toolkit/rewiter-ruler/main/QuietStart.plugin)**

目前收录首个成员：爱奇艺鸿蒙版 `com.qiyi.video.hmy`，包含在 nova 确认的 **16 条动作规则：3 条域名拒绝、13 条响应脚本**。以后新增应用会进入同一个合集地址，爱奇艺分包是合集的一个成员。

## 连接轻启·分流器

打开 [合集按应用导入配置](https://raw.githubusercontent.com/qs-toolkit/rewiter-ruler/main/collection/QuietStart.conf)，复制完整内容，在「MITM → 规则管理 → 新增」中粘贴并导入。配置使用客户端现有的 `[Remote Plugin]` 批量导入格式，各应用分包按名称匹配本机应用并加载对应脚本。导入后可在各应用中独立选择规则。

当前轻启客户端支持粘贴这份配置的**内容**，尚不支持直接粘贴配置 URL 来自动展开。新增应用后重新导入最新配置内容；原有应用来源可通过「更新订阅」更新。

`QuietStart.plugin` 是面向支持 Loon 格式客户端的完整合并规则。插件文本按应用加注释分段，MITM 主机名合并去重；它本身不强制包名范围。轻启按上面的应用配置接入，可以保留应用绑定和脚本加载。

完整连接信息见 [config/quietstart.json](config/quietstart.json)；[合集目录](collection/manifest.json)记录合集版本、SHA-256、应用成员及每条规则的选择身份。

## 架构

```text
apps/<应用>/rules.json       各应用的规则源文件、版本、包名、来源、依赖
          │
          └─ npm run build
                 ├─ QuietStart.plugin              统一合集订阅
                 ├─ collection/manifest.json        合集成员、规则身份和哈希
                 ├─ collection/QuietStart.conf      按应用批量导入配置
                 ├─ plugins/<应用>.plugin           各应用分包
                 ├─ catalog/index.json              应用目录
                 └─ config/                        连接信息和订阅列表
scripts/                    构建、校验、外部脚本核验
tests/                      选择身份、多应用合并和生成物回归
.github/workflows/          提交与 PR 校验
validation/                 接入验证回执
```

添加应用：在 `apps/<id>/rules.json` 填写独立包名、规则、来源及脚本依赖，再执行构建。构建自动扫描所有应用，更新合集、目录和导入配置，不需要手动拼接规则。当前未添加其他应用的示例或未经确认的规则。

使用 Node.js 22 或更新版本，无 npm 依赖：

```sh
npm run build
npm test
npm run check
npm run verify:upstream
```

无法直连 GitHub raw 时，可用已配置的 GitHub CLI 核验同一脚本字节：`npm run verify:upstream -- --github-api`。

规则变化时递增对应应用的 `version`；合集版本由全部成员的内容生成，同一输入得到相同输出。构建保留各应用原始规则身份，并校验跨应用脚本依赖哈希是否冲突。MITM 主机名是配套配置，不计入动作规则条数。

## 爱奇艺来源与验证

16 条规则的上游来源和行号保存在 [爱奇艺规则源文件](apps/iqiyi/rules.json)。脚本引用 [zirawell/R-Store 的 cntv.js](https://github.com/zirawell/R-Store/blob/main/Res/Scripts/AntiAd/cntv.js)，未复制、改写或重新授权第三方脚本。确认的 SHA-256 为 `a5242876770cd4c151435f687e98bf58dcf75fe8cad9e7f256ec26f019fb7c1b`。

原始脚本 URL 指向上游 `main`，可能变化。记录的哈希供命令行核验使用，客户端不会因为此清单而强制校验远程哈希；更新前可运行 `npm run verify:upstream`，变化后先审阅再更新依赖记录和版本。

2026-11-01 已在 nova 导入爱奇艺应用分包，HTTP 200，缓存与发布文件一致，原有 16 条选择、其他应用规则和节点配置保留。客户端解析和原生编译均无诊断，见 [接入回执](validation/iqiyi-nova-20261101.json)。本次合集继续引用同一个爱奇艺分包地址。

保留所选的精确域名与后缀规则；`t7z.cupid.iqiyi.com` 命中域名拒绝时会先阻断，同一主机上的 mixer 响应脚本没有执行机会。HTTPS 改写需要应用接受设备 CA。上述验证覆盖规则接入与一致性，未作真实应用全部去广告通过的结论。

仓库仅存公开规则和连接地址，不保存设备标识、CA、节点、订阅凭据或采集报文。上游内容权利归各自作者，仓库不替上游授予额外许可。
