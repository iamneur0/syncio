# Changelog

## [0.1.0](https://github.com/iamneur0/syncio/compare/v0.0.18...v0.1.0) (2025-10-11)


### Features

* added more account management options, category full deletion ([0b0ce45](https://github.com/iamneur0/syncio/commit/0b0ce45b92bacb8f06f730d5e9e175cd83d286cb))
* addon selection and UI buttons reworked ([10a9087](https://github.com/iamneur0/syncio/commit/10a908740787f02c29ef1535c31cfe26e5ebd874))
* disable automatic backup feature in public mode ([b3366a2](https://github.com/iamneur0/syncio/commit/b3366a20b3bf07f555b47c014c5c82f4f7c69f89))
* finished UI + fixed group toggle ([e4d3ab8](https://github.com/iamneur0/syncio/commit/e4d3ab82deb44a1025772bca476ece74eb9b5731))
* improved UI ([3f755ba](https://github.com/iamneur0/syncio/commit/3f755ba95c9f6aa675ceb7eb5c029c7a03bf6e05))
* selection to user and group tabs ([4626429](https://github.com/iamneur0/syncio/commit/46264293b086fb2c8957a04d483ceff707597c23))
* UI Refactor ([fea5ed4](https://github.com/iamneur0/syncio/commit/fea5ed469aff2b252fc25c480b341c5dcf4c8885))

## [0.0.18](https://github.com/iamneur0/syncio/compare/v0.0.17...v0.0.18) (2025-10-08)


### Bug Fixes

* dynamically create schema.prisma based on INSTANCE type ([bada755](https://github.com/iamneur0/syncio/commit/bada7554a542c0c3f6bf1ca17c58ef5ea09e92dc))

## [0.0.17](https://github.com/iamneur0/syncio/compare/v0.0.16...v0.0.17) (2025-10-08)


### Bug Fixes

* resolve Docker build and backend runtime issues ([15c032d](https://github.com/iamneur0/syncio/commit/15c032dddf651132aecc4a433315a7378c579e40))

## [0.0.16](https://github.com/iamneur0/syncio/compare/v0.0.15...v0.0.16) (2025-10-08)


### Features

* added addon resource selection ([1137ce6](https://github.com/iamneur0/syncio/commit/1137ce65acd5936f32232917f56b173ad47d83bd))
* addon manifest fetching reworked to match resource filtering ([f9ef7b0](https://github.com/iamneur0/syncio/commit/f9ef7b09eddd194b996d6e82ef9002e065257882))
* display addon ressources ([78e75a0](https://github.com/iamneur0/syncio/commit/78e75a09b8a40f096a8fced0f4f54c2fedc22fab))
* improved addon import ([edaa948](https://github.com/iamneur0/syncio/commit/edaa9484bccfafcac7997d1ef171b6662689e441))
* improved config import ([500cfff](https://github.com/iamneur0/syncio/commit/500cfffe76f4d59c99d9077721c9714b1a088587))
* improved security for protectedAddons and excludedAddons and sync logic ([b199317](https://github.com/iamneur0/syncio/commit/b199317da4c2f248f9813e810ef03d8e4924a9cb))
* reloading now resource filter based ([efb1b93](https://github.com/iamneur0/syncio/commit/efb1b9369c1981b9f98626f108f512fe122b61f5))
* removed unused resources from exports ([864a8ee](https://github.com/iamneur0/syncio/commit/864a8eeac3ded430c2b4ebf1e92facf270babfb9))
* scheduled backups ([4aa7c5b](https://github.com/iamneur0/syncio/commit/4aa7c5bf429aecfdf3db6bbc29eb0b474f3fba93))


### Bug Fixes

* account addon conflict impacting sync ([414cccf](https://github.com/iamneur0/syncio/commit/414cccfb25f9dff051783f11fd723b5f2cdca8cf))
* added missing fields on user addon import ([508dd2e](https://github.com/iamneur0/syncio/commit/508dd2ea51c412243119d86876f0c5c912ab9c36))
* Addon modal UX fixed, edit now needs confirmation ([71e4666](https://github.com/iamneur0/syncio/commit/71e46668a76a4e2576781cea409e1b8e83555548))
* addonsPage fixes ([f39ee93](https://github.com/iamneur0/syncio/commit/f39ee93edacb770903a2116ebadacef87ce74568))
* aligned UI components across themes ([d46e2a7](https://github.com/iamneur0/syncio/commit/d46e2a79d923d96fb5e53f0f6b046584c3aba79c))
* group addon visual duplication ([a082f85](https://github.com/iamneur0/syncio/commit/a082f850b2f999926f2627ae46e409e8d2eade22))
* now syncing manifest from db instead of live fetching ([50cb55d](https://github.com/iamneur0/syncio/commit/50cb55db9ce9288f6fe7c071fb802435a2da7524))
* re-designed addon modal ([a2fda21](https://github.com/iamneur0/syncio/commit/a2fda21b74592de802d66c9beb43638fdda4d05f))
* removed excluded tag, redundant with icon ([15dd09d](https://github.com/iamneur0/syncio/commit/15dd09db1c50a19e337c3b4c2628257ccec0d6f6))
* replaced private compose ([5ec1944](https://github.com/iamneur0/syncio/commit/5ec19449b2c190ae75feb8c577e41e0119d297b4))
* udpated db models for ressources ([0142845](https://github.com/iamneur0/syncio/commit/014284509e41d228aecb501d957de1df61dd0d2c))
* updated compose files ([fd45b97](https://github.com/iamneur0/syncio/commit/fd45b9702da9485e96e0d5a571ad3f8cbd9db593))


### Miscellaneous Chores

* release 0.0.16 ([805d55f](https://github.com/iamneur0/syncio/commit/805d55f60dfa0ed1c6afb69c46f9f94fa58d9240))

## [0.0.15](https://github.com/iamneur0/syncio/compare/v0.0.14...v0.0.15) (2025-10-07)


### Bug Fixes

* clean up release-please manifest JSON formatting ([8c012d9](https://github.com/iamneur0/syncio/commit/8c012d96b40a46931cca23f6994e55e6ae222507))
* correct release-please manifest to v0.0.14 ([c37e3d2](https://github.com/iamneur0/syncio/commit/c37e3d2f14054557654f641cdfac5f62c0114b88))
* correct release-please manifest to v0.0.14 ([aaaebe2](https://github.com/iamneur0/syncio/commit/aaaebe2a88f7216d6763f65d82a72825e569d5e9))
* simplify release-please manifest JSON format ([5b7a5fd](https://github.com/iamneur0/syncio/commit/5b7a5fd2a69c6d9b688bd46797fcd80a5ef5a489))

## [0.0.14](https://github.com/iamneur0/syncio/compare/v0.0.12...v0.0.14) (2025-10-07)


### Features

* added missing crypt/hash files ([b38edc0](https://github.com/iamneur0/syncio/commit/b38edc09ab5de49ce0f7d54143b14a7686576bea))
* added new features to private instances ([df4fcaa](https://github.com/iamneur0/syncio/commit/df4fcaa9921b95f15fdc9b8c108be9836f84340c))
* added uniqueness of users + same-email user handling ([72c540d](https://github.com/iamneur0/syncio/commit/72c540d800b66786bc76f7a9cf4a343abdc2a630))
* bumped version ([ba8b477](https://github.com/iamneur0/syncio/commit/ba8b4771f23537c09e5ee5b6e40f0d4d9a23cdcf))
* public instance fixed + sync + export/import ([8c2b533](https://github.com/iamneur0/syncio/commit/8c2b533bbbd5a7c500edc1d0c37c4ba005d06798))
* public instance with auth ([df201fc](https://github.com/iamneur0/syncio/commit/df201fca816dd5858bd1d84d07fe9ce7eb797d1c))
* public release with new pipeline ([1b23d83](https://github.com/iamneur0/syncio/commit/1b23d8331baf030026479801a528627599066be9))


### Bug Fixes

* add latest tag to private Docker image in workflow ([f53d7f3](https://github.com/iamneur0/syncio/commit/f53d7f3449c32232e0524923b224654188d8a1ee))
* added missing nexts files for docker build ([54dcaae](https://github.com/iamneur0/syncio/commit/54dcaae004c58c110a75beec8ea65a1432644809))
* cleanup private and public logic ([813c3f9](https://github.com/iamneur0/syncio/commit/813c3f96aa5150a67ef3d5d833425b125a79d979))
* fixed release please ([9f54395](https://github.com/iamneur0/syncio/commit/9f543953c8126a9983bd217333b4afc99baefff1))
* polishing release ([998f69a](https://github.com/iamneur0/syncio/commit/998f69a3990abd66053b999fd590a63613593bea))
* regressions cleaned up ([eaf5785](https://github.com/iamneur0/syncio/commit/eaf5785bc9ce0ee44b2e4e5d45988da6bc210465))
* release fixed ([9a3a02a](https://github.com/iamneur0/syncio/commit/9a3a02ad7a97e38752ba2d85544f5b9a4445fb9e))
* removed useless declarations for simplified docker envs ([6d7139d](https://github.com/iamneur0/syncio/commit/6d7139d75b3fc86fad17dd736e11f971522349f5))
* reset release-please manifest to match actual latest tag v0.0.12 ([acc1e28](https://github.com/iamneur0/syncio/commit/acc1e28becfcc19af003fd30ab3076be54599404))
* resolved changelog conflict ([4a127e7](https://github.com/iamneur0/syncio/commit/4a127e7bcde4392e815ddd3bc1a701116a2c0698))


### Miscellaneous Chores

* release 0.0.13 ([51188d7](https://github.com/iamneur0/syncio/commit/51188d783d8fb613d156db14c7fe1f844f17b44a))
* release 0.0.14 ([3929546](https://github.com/iamneur0/syncio/commit/39295469831191e2c9f42ee34c510aa921818e62))

## [0.0.13](https://github.com/iamneur0/syncio/compare/v0.0.12...v0.0.13) (2025-10-06)

### Features

* added missing crypt/hash files ([b38edc0](https://github.com/iamneur0/syncio/commit/b38edc09ab5de49ce0f7d54143b14a7686576bea))
* added new features to private instances ([df4fcaa](https://github.com/iamneur0/syncio/commit/df4fcaa9921b95f15fdc9b8c108be9836f84340c))
* public instance fixed + sync + export/import ([8c2b533](https://github.com/iamneur0/syncio/commit/8c2b533bbbd5a7c500edc1d0c37c4ba005d06798))
* public instance with auth ([df201fc](https://github.com/iamneur0/syncio/commit/df201fca816dd5858bd1d84d07fe9ce7eb797d1c))
* public release with new pipeline ([1b23d83](https://github.com/iamneur0/syncio/commit/1b23d8331baf030026479801a528627599066be9))
* added uniqueness of users + same-email user handling ([72c540d](https://github.com/iamneur0/syncio/commit/72c540d800b66786bc76f7a9cf4a343abdc2a630))

### Bug Fixes

* added missing nexts files for docker build ([54dcaae](https://github.com/iamneur0/syncio/commit/54dcaae004c58c110a75beec8ea65a1432644809))
* cleanup private and public logic ([813c3f9](https://github.com/iamneur0/syncio/commit/813c3f96aa5150a67ef3d5d833425b125a79d979))
* fixed release please ([9f54395](https://github.com/iamneur0/syncio/commit/9f543953c8126a9983bd217333b4afc99baefff1))
* polishing release ([998f69a](https://github.com/iamneur0/syncio/commit/998f69a3990abd66053b999fd590a63613593bea))
* regressions cleaned up ([eaf5785](https://github.com/iamneur0/syncio/commit/eaf5785bc9ce0ee44b2e4e5d45988da6bc210465))
* release fixed ([9a3a02a](https://github.com/iamneur0/syncio/commit/9a3a02ad7a97e38752ba2d85544f5b9a4445fb9e))
* removed useless declarations for simplified docker envs ([6d7139d](https://github.com/iamneur0/syncio/commit/6d7139d75b3fc86fad17dd736e11f971522349f5))

## [0.0.12](https://github.com/iamneur0/syncio/compare/v0.0.12...v0.0.12) (2025-09-18)


### Features

* add changelog and release workflows ([193121d](https://github.com/iamneur0/syncio/commit/193121dd73cd768f52412c1ca40009cacb99a392))
* add users and addons directly from group view ([80751f0](https://github.com/iamneur0/syncio/commit/80751f0f1679c330cec7f91b9ec2c6126455af62))
* added group reload feature + misc fixes ([a61d8c4](https://github.com/iamneur0/syncio/commit/a61d8c4dc12bcbc61e18e1ed4ae71e65a3f13897))
* added new themes and many UI improvements ([4507212](https://github.com/iamneur0/syncio/commit/450721281fcd6cbb2c594fb80333aa37285c4436))
* added new view + bug fixes ([16273db](https://github.com/iamneur0/syncio/commit/16273db58aac1793a3a6400d642104fd817b0e7b))
* added user addon clear ([62da7d8](https://github.com/iamneur0/syncio/commit/62da7d858326f802c9478e8391aa913982a690f7))
* added user addon reload ([200e507](https://github.com/iamneur0/syncio/commit/200e507f753d00573365d878bbfac877b987da53))
* authKey auth support ([eb79d07](https://github.com/iamneur0/syncio/commit/eb79d072247591b05aebe523690cdee9b222eda6))
* debug + doc added ([b334c62](https://github.com/iamneur0/syncio/commit/b334c62cc1965f70808973bf7bce48ddf5ba794a))
* debugging now optional ([535eb48](https://github.com/iamneur0/syncio/commit/535eb48c8324aa09c279a90b264b006b2ec516c6))
* enable/disable logic integrated in syncing ([fda09be](https://github.com/iamneur0/syncio/commit/fda09be27b61a980cc2f145890021fce337d592b))
* moves to sqlite for easier deployments ([1086632](https://github.com/iamneur0/syncio/commit/10866327c47a19d1c2da8cb0dc1cc7b76331df9b))
* new logo + different improvements ([94306d3](https://github.com/iamneur0/syncio/commit/94306d34556db15c6dd70309bcb23d87a41aff1a))
* re-added user addon imports ([d3f31e4](https://github.com/iamneur0/syncio/commit/d3f31e494dc8e8808656aec58da1427394508e3d))
* register users directly from syncio ([a711d31](https://github.com/iamneur0/syncio/commit/a711d317b170c3ca9d85f3a8c660c9152b977014))
* seamless db integration, perms set ([961d646](https://github.com/iamneur0/syncio/commit/961d64696d63833d9cbc7bbdc26102273c4b74ad))
* Syncio tab name ([e4a1829](https://github.com/iamneur0/syncio/commit/e4a18299d59f7d35ec1cac58c9af7b6797666d04))
* user registration completed ([da1e77b](https://github.com/iamneur0/syncio/commit/da1e77b1178b17f1117362f047339af652b7a73e))


### Bug Fixes

* added browser tab title ([b2279b8](https://github.com/iamneur0/syncio/commit/b2279b8e9c76e47632a77b177688d381a0692cf4))
* added fix to CI ([e60b023](https://github.com/iamneur0/syncio/commit/e60b0237808376fc1a70f34191389318491ad4d2))
* added missing logo ([667b59c](https://github.com/iamneur0/syncio/commit/667b59c6ef15a14da81d2f9e8afcf561112097be))
* added prisma db push on 1st run ([645fa05](https://github.com/iamneur0/syncio/commit/645fa052cce8fe0dfc8a243e3bcbafbddaf115d3))
* addon discovery ([6f86cd6](https://github.com/iamneur0/syncio/commit/6f86cd68aecb976e4e42108949e77c89c5996785))
* backend fix ([5df5741](https://github.com/iamneur0/syncio/commit/5df5741e3c68f60b0f7925a7f1456ad12a5c63cc))
* ci re-added ([f863b88](https://github.com/iamneur0/syncio/commit/f863b887edeebc5279e2c283abc9d3e9af5c4fb9))
* database path now provided in env ([0cc7684](https://github.com/iamneur0/syncio/commit/0cc7684d067ff0b4bfe176ebf9617b720c7fa1f1))
* Dockerfile fixed with proper script ([bf1c1df](https://github.com/iamneur0/syncio/commit/bf1c1df5e6d7fd17070f02198bb00f64e4a105d6))
* group syncing now handling exclusions + improved UI ([24ead25](https://github.com/iamneur0/syncio/commit/24ead258c9b25813a1b0e4cb8b50f4b775e5802b))
* improved group syncing logic ([58613a4](https://github.com/iamneur0/syncio/commit/58613a46bae373f3f31b2718c9936fccbe139f24))
* improved sync use cases ([47ca018](https://github.com/iamneur0/syncio/commit/47ca018d991b200460830f00e543e816b273bc1f))
* missed logos ([798391d](https://github.com/iamneur0/syncio/commit/798391d7ea68af34b361d338fcd4135389c0f1a0))
* multiple fixes for backend ([a728153](https://github.com/iamneur0/syncio/commit/a7281537967e86475dba1d9cb6f572a5d97ff98e))
* permission issue fixed with UID & GID ([84b3152](https://github.com/iamneur0/syncio/commit/84b315290fbe6602374e306e25e3807076d595d9))
* prevent prisma migration with initial push ([42bc0fe](https://github.com/iamneur0/syncio/commit/42bc0fe2b1063be6d5284035354fa1dbba002b44))
* prisma database create ([aa6f4e9](https://github.com/iamneur0/syncio/commit/aa6f4e997b55e727ee24e4d705f5f2f413e6908d))
* removed db check, redundant with compose ([e0aab6e](https://github.com/iamneur0/syncio/commit/e0aab6eb99b1db6131a3e632ddfbb31f698e54df))
* skipDuplicates removed as unused ([52542c4](https://github.com/iamneur0/syncio/commit/52542c4a5ae436177f0d9ce33684301f94657714))
* sync better handling of protected addons, prevents duplication ([e5c6ad5](https://github.com/iamneur0/syncio/commit/e5c6ad5d948c2e7d716c727e92ace06e5e2901bc))
* sync logic improved ([e9225bd](https://github.com/iamneur0/syncio/commit/e9225bdea3e9ffb93aa303a1b086d0de334f3467))
* update package-lock.json for semantic-release dependencies ([6f980b6](https://github.com/iamneur0/syncio/commit/6f980b6837d2b184cdfd9979f1875c888badf2dc))
* update release please workflow to use correct action and token ([01fb91c](https://github.com/iamneur0/syncio/commit/01fb91c8c8af441cd3893a7eb2cee7e60cfa34e4))
* use custom release please token ([02631d4](https://github.com/iamneur0/syncio/commit/02631d46586db4a0ec89996cef03418fbf96cb9c))
* use custom release please token ([2deffc8](https://github.com/iamneur0/syncio/commit/2deffc8f9a579ca17bfc99701558fa196c71385e))


### Miscellaneous Chores

* release 0.0.11 ([4b40066](https://github.com/iamneur0/syncio/commit/4b40066ce641516c418e340302d734857b01e3b0))
* release 0.0.12 ([14bb94d](https://github.com/iamneur0/syncio/commit/14bb94df4e51ab1fc081b839ff6245c8193a9fa7))

## [0.0.11](https://github.com/iamneur0/syncio/compare/v0.0.11...v0.0.11) (2025-09-18)


### Features

* add changelog and release workflows ([193121d](https://github.com/iamneur0/syncio/commit/193121dd73cd768f52412c1ca40009cacb99a392))
* added group reload feature + misc fixes ([a61d8c4](https://github.com/iamneur0/syncio/commit/a61d8c4dc12bcbc61e18e1ed4ae71e65a3f13897))
* added new themes and many UI improvements ([4507212](https://github.com/iamneur0/syncio/commit/450721281fcd6cbb2c594fb80333aa37285c4436))
* added new view + bug fixes ([16273db](https://github.com/iamneur0/syncio/commit/16273db58aac1793a3a6400d642104fd817b0e7b))
* added user addon reload ([200e507](https://github.com/iamneur0/syncio/commit/200e507f753d00573365d878bbfac877b987da53))
* authKey auth support ([eb79d07](https://github.com/iamneur0/syncio/commit/eb79d072247591b05aebe523690cdee9b222eda6))
* debug + doc added ([b334c62](https://github.com/iamneur0/syncio/commit/b334c62cc1965f70808973bf7bce48ddf5ba794a))
* debugging now optional ([535eb48](https://github.com/iamneur0/syncio/commit/535eb48c8324aa09c279a90b264b006b2ec516c6))
* enable/disable logic integrated in syncing ([fda09be](https://github.com/iamneur0/syncio/commit/fda09be27b61a980cc2f145890021fce337d592b))
* moves to sqlite for easier deployments ([1086632](https://github.com/iamneur0/syncio/commit/10866327c47a19d1c2da8cb0dc1cc7b76331df9b))
* new logo + different improvements ([94306d3](https://github.com/iamneur0/syncio/commit/94306d34556db15c6dd70309bcb23d87a41aff1a))
* re-added user addon imports ([d3f31e4](https://github.com/iamneur0/syncio/commit/d3f31e494dc8e8808656aec58da1427394508e3d))
* seamless db integration, perms set ([961d646](https://github.com/iamneur0/syncio/commit/961d64696d63833d9cbc7bbdc26102273c4b74ad))


### Bug Fixes

* added browser tab title ([b2279b8](https://github.com/iamneur0/syncio/commit/b2279b8e9c76e47632a77b177688d381a0692cf4))
* added fix to CI ([e60b023](https://github.com/iamneur0/syncio/commit/e60b0237808376fc1a70f34191389318491ad4d2))
* added missing logo ([667b59c](https://github.com/iamneur0/syncio/commit/667b59c6ef15a14da81d2f9e8afcf561112097be))
* added prisma db push on 1st run ([645fa05](https://github.com/iamneur0/syncio/commit/645fa052cce8fe0dfc8a243e3bcbafbddaf115d3))
* addon discovery ([6f86cd6](https://github.com/iamneur0/syncio/commit/6f86cd68aecb976e4e42108949e77c89c5996785))
* backend fix ([5df5741](https://github.com/iamneur0/syncio/commit/5df5741e3c68f60b0f7925a7f1456ad12a5c63cc))
* ci re-added ([f863b88](https://github.com/iamneur0/syncio/commit/f863b887edeebc5279e2c283abc9d3e9af5c4fb9))
* database path now provided in env ([0cc7684](https://github.com/iamneur0/syncio/commit/0cc7684d067ff0b4bfe176ebf9617b720c7fa1f1))
* Dockerfile fixed with proper script ([bf1c1df](https://github.com/iamneur0/syncio/commit/bf1c1df5e6d7fd17070f02198bb00f64e4a105d6))
* group syncing now handling exclusions + improved UI ([24ead25](https://github.com/iamneur0/syncio/commit/24ead258c9b25813a1b0e4cb8b50f4b775e5802b))
* improved group syncing logic ([58613a4](https://github.com/iamneur0/syncio/commit/58613a46bae373f3f31b2718c9936fccbe139f24))
* improved sync use cases ([47ca018](https://github.com/iamneur0/syncio/commit/47ca018d991b200460830f00e543e816b273bc1f))
* missed logos ([798391d](https://github.com/iamneur0/syncio/commit/798391d7ea68af34b361d338fcd4135389c0f1a0))
* multiple fixes for backend ([a728153](https://github.com/iamneur0/syncio/commit/a7281537967e86475dba1d9cb6f572a5d97ff98e))
* permission issue fixed with UID & GID ([84b3152](https://github.com/iamneur0/syncio/commit/84b315290fbe6602374e306e25e3807076d595d9))
* prevent prisma migration with initial push ([42bc0fe](https://github.com/iamneur0/syncio/commit/42bc0fe2b1063be6d5284035354fa1dbba002b44))
* prisma database create ([aa6f4e9](https://github.com/iamneur0/syncio/commit/aa6f4e997b55e727ee24e4d705f5f2f413e6908d))
* removed db check, redundant with compose ([e0aab6e](https://github.com/iamneur0/syncio/commit/e0aab6eb99b1db6131a3e632ddfbb31f698e54df))
* skipDuplicates removed as unused ([52542c4](https://github.com/iamneur0/syncio/commit/52542c4a5ae436177f0d9ce33684301f94657714))
* sync better handling of protected addons, prevents duplication ([e5c6ad5](https://github.com/iamneur0/syncio/commit/e5c6ad5d948c2e7d716c727e92ace06e5e2901bc))
* sync logic improved ([e9225bd](https://github.com/iamneur0/syncio/commit/e9225bdea3e9ffb93aa303a1b086d0de334f3467))
* update package-lock.json for semantic-release dependencies ([6f980b6](https://github.com/iamneur0/syncio/commit/6f980b6837d2b184cdfd9979f1875c888badf2dc))
* update release please workflow to use correct action and token ([01fb91c](https://github.com/iamneur0/syncio/commit/01fb91c8c8af441cd3893a7eb2cee7e60cfa34e4))
* use custom release please token ([02631d4](https://github.com/iamneur0/syncio/commit/02631d46586db4a0ec89996cef03418fbf96cb9c))
* use custom release please token ([2deffc8](https://github.com/iamneur0/syncio/commit/2deffc8f9a579ca17bfc99701558fa196c71385e))


### Miscellaneous Chores

* release 0.0.11 ([4b40066](https://github.com/iamneur0/syncio/commit/4b40066ce641516c418e340302d734857b01e3b0))

## [0.1.0](https://github.com/iamneur0/syncio/compare/v0.0.1...v0.1.0) (2025-09-18)


### Features

* add changelog and release workflows ([193121d](https://github.com/iamneur0/syncio/commit/193121dd73cd768f52412c1ca40009cacb99a392))
* added group reload feature + misc fixes ([a61d8c4](https://github.com/iamneur0/syncio/commit/a61d8c4dc12bcbc61e18e1ed4ae71e65a3f13897))
* added new themes and many UI improvements ([4507212](https://github.com/iamneur0/syncio/commit/450721281fcd6cbb2c594fb80333aa37285c4436))
* added new view + bug fixes ([16273db](https://github.com/iamneur0/syncio/commit/16273db58aac1793a3a6400d642104fd817b0e7b))
* added user addon reload ([200e507](https://github.com/iamneur0/syncio/commit/200e507f753d00573365d878bbfac877b987da53))
* authKey auth support ([eb79d07](https://github.com/iamneur0/syncio/commit/eb79d072247591b05aebe523690cdee9b222eda6))
* debug + doc added ([b334c62](https://github.com/iamneur0/syncio/commit/b334c62cc1965f70808973bf7bce48ddf5ba794a))
* debugging now optional ([535eb48](https://github.com/iamneur0/syncio/commit/535eb48c8324aa09c279a90b264b006b2ec516c6))
* enable/disable logic integrated in syncing ([fda09be](https://github.com/iamneur0/syncio/commit/fda09be27b61a980cc2f145890021fce337d592b))
* moves to sqlite for easier deployments ([1086632](https://github.com/iamneur0/syncio/commit/10866327c47a19d1c2da8cb0dc1cc7b76331df9b))
* new logo + different improvements ([94306d3](https://github.com/iamneur0/syncio/commit/94306d34556db15c6dd70309bcb23d87a41aff1a))
* re-added user addon imports ([d3f31e4](https://github.com/iamneur0/syncio/commit/d3f31e494dc8e8808656aec58da1427394508e3d))
* seamless db integration, perms set ([961d646](https://github.com/iamneur0/syncio/commit/961d64696d63833d9cbc7bbdc26102273c4b74ad))


### Bug Fixes

* added browser tab title ([b2279b8](https://github.com/iamneur0/syncio/commit/b2279b8e9c76e47632a77b177688d381a0692cf4))
* added fix to CI ([e60b023](https://github.com/iamneur0/syncio/commit/e60b0237808376fc1a70f34191389318491ad4d2))
* added missing logo ([667b59c](https://github.com/iamneur0/syncio/commit/667b59c6ef15a14da81d2f9e8afcf561112097be))
* added prisma db push on 1st run ([645fa05](https://github.com/iamneur0/syncio/commit/645fa052cce8fe0dfc8a243e3bcbafbddaf115d3))
* addon discovery ([6f86cd6](https://github.com/iamneur0/syncio/commit/6f86cd68aecb976e4e42108949e77c89c5996785))
* backend fix ([5df5741](https://github.com/iamneur0/syncio/commit/5df5741e3c68f60b0f7925a7f1456ad12a5c63cc))
* ci re-added ([f863b88](https://github.com/iamneur0/syncio/commit/f863b887edeebc5279e2c283abc9d3e9af5c4fb9))
* database path now provided in env ([0cc7684](https://github.com/iamneur0/syncio/commit/0cc7684d067ff0b4bfe176ebf9617b720c7fa1f1))
* Dockerfile fixed with proper script ([bf1c1df](https://github.com/iamneur0/syncio/commit/bf1c1df5e6d7fd17070f02198bb00f64e4a105d6))
* group syncing now handling exclusions + improved UI ([24ead25](https://github.com/iamneur0/syncio/commit/24ead258c9b25813a1b0e4cb8b50f4b775e5802b))
* improved group syncing logic ([58613a4](https://github.com/iamneur0/syncio/commit/58613a46bae373f3f31b2718c9936fccbe139f24))
* improved sync use cases ([47ca018](https://github.com/iamneur0/syncio/commit/47ca018d991b200460830f00e543e816b273bc1f))
* missed logos ([798391d](https://github.com/iamneur0/syncio/commit/798391d7ea68af34b361d338fcd4135389c0f1a0))
* multiple fixes for backend ([a728153](https://github.com/iamneur0/syncio/commit/a7281537967e86475dba1d9cb6f572a5d97ff98e))
* permission issue fixed with UID & GID ([84b3152](https://github.com/iamneur0/syncio/commit/84b315290fbe6602374e306e25e3807076d595d9))
* prevent prisma migration with initial push ([42bc0fe](https://github.com/iamneur0/syncio/commit/42bc0fe2b1063be6d5284035354fa1dbba002b44))
* prisma database create ([aa6f4e9](https://github.com/iamneur0/syncio/commit/aa6f4e997b55e727ee24e4d705f5f2f413e6908d))
* removed db check, redundant with compose ([e0aab6e](https://github.com/iamneur0/syncio/commit/e0aab6eb99b1db6131a3e632ddfbb31f698e54df))
* sync logic improved ([e9225bd](https://github.com/iamneur0/syncio/commit/e9225bdea3e9ffb93aa303a1b086d0de334f3467))
* update package-lock.json for semantic-release dependencies ([6f980b6](https://github.com/iamneur0/syncio/commit/6f980b6837d2b184cdfd9979f1875c888badf2dc))
* update release please workflow to use correct action and token ([01fb91c](https://github.com/iamneur0/syncio/commit/01fb91c8c8af441cd3893a7eb2cee7e60cfa34e4))
* use custom release please token ([02631d4](https://github.com/iamneur0/syncio/commit/02631d46586db4a0ec89996cef03418fbf96cb9c))
* use custom release please token ([2deffc8](https://github.com/iamneur0/syncio/commit/2deffc8f9a579ca17bfc99701558fa196c71385e))

## Changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
