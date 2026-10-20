/* ===================== 公教中学（附小）Catholic High School (Primary) — P4 华文 EOY 2025 ===================== */
TESTS.push({
  id: 'catholichigh', school: '公教中学（附小）', schoolEn: 'Catholic High School (Primary)', short: 'Catholic High',
  paper: '试卷二 语文理解与运用', paperEn: 'Paper 2 · Language', exam: '2025 年终考试', date: '29 Oct 2025', duration: '1 小时',
  sections: [
    { id: 's1', title: '一、语文应用', marks: 12, desc: '请从提供的选项中选出正确的答案。' },
    { id: 's2', title: '二、短文填空', marks: 8, desc: '根据短文的内容和上下文的意思，从括号中选出适当的答案。',
      passage: P(
        `小安是个乐于助人的孩子。每次同学遇到困难，他都会帮助他们。这天早上，小安刚走进课室，就看到明文站在座位旁，看起来很${QB(7)}。原来明文的水瓶不见了。`,
        `小安听了，便帮他一起找。他们来到楼下的食堂，终于在长椅底下发现了那个蓝色的水瓶。明文${QB(8)}地说：“太谢谢你了！”小安笑着说：“不用客气！”`,
        `回到课室，同学们正在听老师讲故事，小安和明文小声地走进来${QB(9)}坐回自己的座位。课后，老师知道事情的经过后，夸小安是个有爱心的孩子。`,
        `小安听了老师的话，心里感到${QB(10)}。他点了点头，因为他知道，帮助别人是一件快乐的事。`) },
    { id: 's3', title: '三、词语搭配', marks: 8, desc: '选出最适当的词语。', bank: ['到达', '拼命', '表扬', '长辈', '挑选', '礼貌'] },
    { id: 's4', title: '四、阅读理解一', marks: 8, desc: '根据短文的内容和上下文的意思，选出适当的答案。',
      passage: `<div class="notice">
        <h4>《最可爱狗儿比赛》</h4>
        <p>大家好！想让您和狗儿度过难忘的一天吗？您可以帮狗儿报名参加《最可爱狗儿比赛》，它们可能会得到丰富的奖品。欢迎您和家人一起来观看比赛，拍照做纪念。</p>
        <div class="infobox">日期：2025年11月8日（星期六）<br>时间：下午1点至3点<br>地点：东海岸地铁站前</div>
        <div class="infobox dashed">第一名：一座大奖杯<br>第二名：十盒狗饼干<br>第三名：一套狗玩具</div>
        <p>注意事项：</p>
        <ol><li><u>www.lovelypets.com.sg</u> 请上网报名，填写主人姓名、电话和提供狗儿的照片。</li><li>参赛者最迟12点30分报到。</li><li>报名费10元。</li></ol></div>` },
    { id: 's5', title: '五、阅读理解二', marks: 9, desc: '根据短文和上下文的意思，回答下列问题。',
      passage: P(
        '明华要代表班级参加学校的讲故事比赛。他练习了很久，把故事的每个字都记得清清楚楚。',
        '比赛那天，明华登上台时，看着观众席的同学们，突然头脑一片空白，心里非常焦急。他的脸一下子红了，双手也开始发抖。',
        '这时，明华看到他的级任老师李老师坐在台下第一排的座位上，对他微笑点头。明华想起李老师常常鼓励同学们。明华深深吸了一口气，提醒自己要有信心。就这样，明华慢慢把背好的故事都想起来，大声地说了出来。',
        '比赛结束后，明华得了“优秀表现奖”。李老师对他竖起大拇指，说：“遇到困难不放弃才是最棒的！”听了李老师的话，明华感觉比得奖更开心，两边嘴角高高上扬。') }
  ],
  notes: [
    'The listening comprehension paper (听力理解) needs the recording, so it is not included.',
    'Q17–Q22 have no options on the paper, so they are written by hand on paper and photographed.',
    'Q17: the answer key says “邻居楼下”, but the question says “组屋楼下”. Either is fine.',
    'The dog pictures on the notice (Q15–Q17) have been left out; they carry no information.'
  ],
  questions: [
    { id: '1', sec: 's1', marks: 2, type: 'mcq', topic: 'zi', q: `这件事情就是小华做的，他却不肯${B}认。`, opts: ['成', '承', '称', '乘'], ans: 2,
      why: '说出是自己做的，是“承认”。承认 = to admit.' },
    { id: '2', sec: 's1', marks: 2, type: 'mcq', topic: 'zi', q: `上班下班时间，地铁车${B}内挤满了人。`, opts: ['厢', '相', '箱', '想'], ans: 1,
      why: '地铁里坐人的地方叫“车厢”。厢 (xiāng)。' },
    { id: '3', sec: 's1', marks: 2, type: 'mcq', topic: 'ci', q: `马路如虎口，大家都必须遵守交通${B}。`, opts: ['路线', '秩序', '短信', '规则'], ans: 4,
      why: '“遵守”常和“规则”搭配：遵守交通规则 = obey traffic rules.' },
    { id: '4', sec: 's1', marks: 2, type: 'mcq', topic: 'ci', q: `弟弟在学走路的时候，爸爸一直${B}地扶着他。`, opts: ['兴奋', '重复', '耐心', '顺利'], ans: 3,
      why: '一直慢慢地扶着，不怕麻烦，是“耐心”。= patiently.' },
    { id: '5', sec: 's1', marks: 2, type: 'mcq', topic: 'ci', q: `妹妹手上${B}妈妈新买的手表。`, opts: ['举起', '戴着', '套上', '投去'], ans: 2,
      why: '手表是“戴”在手上的：戴着手表 = wearing a watch.' },
    { id: '6', sec: 's1', marks: 2, type: 'mcq', topic: 'ci', q: `小文经过家人的${B}，决定更加用功学习。`, opts: ['介绍', '采访', '劝告', '保证'], ans: 3,
      why: '家人对他说了好的建议，他就改变了，是“劝告”。劝告 = advice.' },
    { id: '7', sec: 's2', marks: 2, type: 'mcq', topic: 'cloze', q: `明文站在座位旁，看起来很${QB(7)}。原来明文的水瓶不见了。`, opts: ['紧张', '害羞', '疲倦', '可怜'], ans: 1,
      why: '东西不见了，心里着急、不安，是“紧张”。= anxious.' },
    { id: '8', sec: 's2', marks: 2, type: 'mcq', topic: 'cloze', q: `终于在长椅底下发现了那个蓝色的水瓶。明文${QB(8)}地说：“太谢谢你了！”`, opts: ['闷闷不乐', '怒气冲冲', '眉开眼笑', '见义勇为'], ans: 3,
      why: '找到了水瓶很高兴，是“眉开眼笑”。= beaming with joy.' },
    { id: '9', sec: 's2', marks: 2, type: 'mcq', topic: 'cloze', q: `小安和明文小声地走进来${QB(9)}坐回自己的座位。`, opts: ['刚刚', '偷偷', '纷纷', '悄悄'], ans: 4,
      why: '不吵到正在听故事的同学，轻轻地坐回去，是“悄悄”。“偷偷”是不想让人知道（做不对的事）。' },
    { id: '10', sec: 's2', marks: 2, type: 'mcq', topic: 'cloze', q: `小安听了老师的话，心里感到${QB(10)}。`, opts: ['幸运', '温暖', '感动', '舒服'], ans: 2,
      why: '被老师夸奖，心里暖暖的、很开心，是“温暖”。= warm.' },
    { id: '11', sec: 's3', marks: 2, type: 'bank', topic: 'dapei', q: '（　　）礼物', ans: 5, why: '挑选礼物 = choose a present.' },
    { id: '12', sec: 's3', marks: 2, type: 'bank', topic: 'dapei', q: '获得（　　）', ans: 3, why: '获得表扬 = receive praise.' },
    { id: '13', sec: 's3', marks: 2, type: 'bank', topic: 'dapei', q: '（　　）推挤', ans: 2, why: '拼命推挤 = push with all one\'s strength.' },
    { id: '14', sec: 's3', marks: 2, type: 'bank', topic: 'dapei', q: '尊敬（　　）', ans: 4, why: '尊敬长辈 = respect your elders.' },
    { id: '15', sec: 's4', marks: 2, type: 'mcq', topic: 'main', q: `主办《最可爱狗儿比赛》的主要目的是让主人和狗儿${B}。`,
      opts: ['一起去参加比赛', '可以拍照做纪念', '得到丰富的奖品', '度过难忘的一天'], ans: 4,
      why: '通告第一句：“想让您和狗儿度过难忘的一天吗？”这是主要目的。' },
    { id: '16', sec: 's4', marks: 2, type: 'mcq', topic: 'info', q: '以下哪个说法是正确的？',
      opts: ['主人需要带家人去比赛', '参加比赛需要付报名费', '报名时要提供狗儿的名字', '参赛的狗儿都会得到奖品'], ans: 2,
      why: '注意事项：报名费10元。(1) 只是“欢迎”家人来；(3) 要提供狗儿的照片，不是名字；(4) 只有前三名有奖品。' },
    { id: '17', sec: 's4', marks: 4, type: 'write', topic: 'note', lines: 6,
      q: '如果你是小乐，你想带你的狗儿参加这次的《最可爱狗儿比赛》。试写一则便条给邻居小文，希望他能带他的狗儿一起参加比赛。请告诉他比赛日期、地点和你想和他见面的时间。',
      starter: '小文：\n　　我在组屋楼下看到一则《最可爱狗儿比赛》的通告。我会带我的小狗参加，希望＿＿＿＿＿＿……\n　　　　　　　　　　　　　　小乐\n　　　　　　　　　　　　　　10月20日\n　　　　　　　　　　　　　　下午4点',
      key: '小文：我在组屋楼下看到一则《最可爱狗儿比赛》的通告。我会带我的小狗参加，希望你能带你的狗儿一起参加比赛。比赛日期是2025年11月8日（星期六），地点在东海岸地铁站前。我想在12点30分见面。请你和我一起参加。谢谢。',
      scheme: '内容2分：写出日期（2025年11月8日星期六）和地点（东海岸地铁站前）1分；写出一个合理的见面时间 1分（参赛者最迟12点30分报到，所以见面时间要在12点30分或之前）。语文2分：句子通顺、意思清楚、错别字少。' },
    { id: '18', sec: 's5', marks: 2, type: 'write', topic: 'wordctx', lines: 1, q: '文中形容“十分不安”的词语是：＿＿＿＿＿＿',
      key: '焦急', scheme: '只接受“焦急”（文中“心里非常焦急”）。' },
    { id: '19', sec: 's5', marks: 2, type: 'write', topic: 'character', lines: 2, q: '明华上台时，他的心情怎么样？从哪里可以看出？',
      key: '明华登上台时心里非常焦急，他的脸一下子红了，双手也开始发抖，从这几可看出。',
      scheme: '1分：心情——焦急（也可接受紧张、不安）。1分：从哪里看出——脸一下子红了，双手开始发抖（或头脑一片空白）。' },
    { id: '20', sec: 's5', marks: 2, type: 'write', topic: 'info', lines: 2, q: '后来，明华怎么把背好的故事都想起来？',
      key: '明华看到他的级任老师李老师坐在台下第一排的座位上对他微笑点头，想起李老师平时常常鼓励同学们。明华深深吸了一口气，提醒自己要有信心。',
      scheme: '1分：看到李老师对他微笑点头，想起老师常常鼓励同学们。1分：深深吸了一口气，提醒自己要有信心。' },
    { id: '21', sec: 's5', marks: 1, type: 'write', topic: 'info', lines: 2, q: '最后，明华得了什么奖？',
      key: '明华得了“优秀表现奖”。', scheme: '1分：优秀表现奖。' },
    { id: '22', sec: 's5', marks: 2, type: 'write', topic: 'character', lines: 2, q: '老师怎么样称赞明华？明华听了，感觉怎么样？',
      key: '老师对他竖起了大拇指，说遇到困难不要放弃才是最棒的。明华听了老师的话，感觉比得了奖还开心。',
      scheme: '1分：老师竖起大拇指，说“遇到困难不放弃才是最棒的”。1分：明华感觉比得奖更开心。' }
  ]
});

TESTS.push({
  id: 'catholichigh-p1', school: '公教中学（附小）', schoolEn: 'Catholic High School (Primary)', short: 'Catholic High 作文',
  paper: '试卷一 作文', paperEn: 'Paper 1 · Composition', exam: '2025 年终考试', date: '8 Oct 2025', duration: '40 分钟', kind: 'composition',
  sections: [ { id: 'c', title: '看图作文', marks: 15, desc: '' } ],
  notes: [ 'Marked by Gemini against a guide rubric (内容 6, 语文 6, 组织 3). It is not the school\'s official marking scheme.' ],
  questions: [
    { id: '1', sec: 'c', marks: 15, type: 'essay', topic: 'composition', minChars: 80,
      q: '根据以下的图片，写一篇作文。字数不可少过80字。写作时，可参考所提供的词语。',
      img: 'img/catholichigh-composition.jpg',
      words: ['搭地铁', '急急忙忙', '一张卡', '掉在地上', '没有发现', '叫住', '捡起', '归还', '感谢', '称赞'],
      picture: '图1：在地铁站，一位背着背包的叔叔急急忙忙地刷卡进站，一男一女两个小朋友也在搭地铁。图2：叔叔赶着走，一张卡从他身上掉在地上，他没有发现；两个小朋友看到了。图3：男孩跑上前叫住叔叔，女孩把卡捡起来。图4：小朋友把卡归还给叔叔，叔叔拿着卡，笑着感谢、称赞他们。',
      key: '一篇合格的作文要按四幅图的顺序写：叔叔急急忙忙搭地铁；他的卡掉在地上，他没有发现；两个小朋友叫住他、捡起卡；把卡归还给叔叔，叔叔感谢并称赞他们。最好写出人物的心情和对话，结尾说出感受或学到的道理（拾金不昧、乐于助人）。',
      scheme: '总分15分。内容6分：四幅图的情节都写到、顺序正确、内容合理，有人物心情或对话。语文6分：用词恰当（能用参考词语）、句子通顺、标点正确、错别字少。组织3分：有开头、经过和结尾，分段清楚。少于80个字要扣分。' }
  ]
});
