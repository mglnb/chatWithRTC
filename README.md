# 1. WebRTC
WebRTC (_Web Real-Time Communications_ ou Comunicações Web em Tempo Real) é uma tecnologia o qual permite aplicações web e sites capturar e opcionalmente, transmitir audio e/ou vídeo. Assim como trocar dados através de browsers sem requerir um intermediário. O conjunto de padrões que o WebRTC inclui, torna possível compartilhar dados e simular tele-conferências p2p, sem requerir o usuário instalar plugins ou _software_ de terceiros.

# 2. Conceitos e Uso de WebRTC
WebRTC contém varios propósitos, e se sobrepõe substancialmente com a API MediaCapture e Streams. Juntos, eles fornecem recursos multimídia poderosos para a Web, incluindo suporte para conferência de áudio e video, troca de arquivos, gerenciamento de identidade e interface com sistemas telefônicos legados ao enviar sinais DTMF. As conexões entre pares podem ser feitas sem exigir drivers especiais ou plugins, e muitas vezes podem ser feitas sem nenhum servidor intermediário.

Há 3 API's principais no WebRTC.
* RTCPeerConnection
* RTCDataChannel
* MediaStream

### 2.1 RTCPeerConnection
`RTCPeerConnection` permite criar uma conexão entre o computador local e um ponto remoto. Esta API fornece metodos para se conectar, manter e monitorar e fechar a conexão com um ponto remoto.

### 2.2 RTCDataChannel
`RTCDataChannel` representa um lugar na rede que pode ser usado para transferencias bidirecionais de dados. Todo canal está associado a um RTCPeerConnection, e cada conexão pode ter até um máximo de 65,534 canais de dados (Pode variar em diferentes navegadores).
### 2.3 MediaStream
`MediaStream` representa os conteúdos de mídias apresentados pela maquina. Nele é armazenado varias faixas, como de áudio e vídeo.
Cada faixa é representado pela instancia de `MediaStreamTrack`

---

Sabendo isso, vamos ao código!  
Primeiramente iniciaremos com um site para tirar fotos

Hospedado em [https://mglnb.github.io/WebRTC-Chat-video/](https://mglnb.github.io/WebRTC-Chat-video/)

NOTE: Chat de vídeo só funciona no firefox


# Chat com Texto, vídeo e áudio

Já que aprendemos o básico na primeira parte, vamos a algo um pouco avançado.
Aprenderemos então a fazer uma sala de chat para multiplos usuários com possibilidade de um usuário fazer ligação de vídeo para outro usuário, isso tudo não apenas de browser pra browser, e sim conexão remota.

Mas para isso, teremos que utilizar mais uma tecnologia e suas dependencias:
* [Node JS](https://nodejs.org/en/) - para criação de um "_Signaling Server_" conforme explicado no ultimo diagrama passado.  
    * [Adapter.js](https://github.com/webrtc/adapter) - Ajuda na compatibilidade entre browsers
    * [WebSockets](https://github.com/theturtle32/WebSocket-Node) - Para criação do server


###### Para melhor visualização dos arquivos que serão utilizados, clone este repositório.

## O Server 

No arquivo server.js está todas configurações do server node.
Para rodar ele, digite no seu prompt de comando. 

    node server.js

Ou hospede o mesmo em algum site, neste exemplo, estou utilizando o Heroku.

## O HTML
---
Iniciaremos então no arquivo index.html.
Primeiramente podemos importar as bibliotecas que serão utilizadas

```html
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" crossorigin="anonymous">
    <link href="css/chat.css" rel="stylesheet">
    <script src="adapter.js"></script>
    <script type="text/javascript" src="index.js"></script>
```

Estaremos utilizando o bootstrap apenas para facilitar o layout.  
Devemos ter então: 

Um campo para o usuário logar.
```html
    <div class="container">
        <div class="row">
            <div class="username">
                <p>
                    <input id="name" type="text" maxlength="12" required autocomplete="username" inputmode="verbatim" placeholder="Usuário">
                    <input id="login" type="button" name="login" value="Login" onclick="connect()">
                </p>
            </div>
        </div>

```
Em seguida temos a lista de usuários, com o chat e os vídeos.
```html
    <div class="row">
        <div id="userlist-container" class="col-xs-2">
            <!-- lista de usuários -->
            <h3 class="title-users">Usuários</h3>
            <p>Clique para realizar chamada</p>
            <ul id="userlistbox"></ul>
        </div>
        <div id="chat-container" class="col-xs-6">
            <!-- Box do chat -->
            <div>
                <iframe id="chatbox"></iframe>
            </div>
        </div>

        <div id="camera-container" class="col-xs-4">
            <!-- Videos -->
            <video id="received_video" autoplay></video>
            <video id="local_video" autoplay muted>

            </video>
            <!-- Botão de desligar a chamada -->
            <button id="hangup-button" onclick="hangUpCall();" class=" glyphicon glyphicon-earphone" disabled>
                </button>
        </div>
    </div>
```
E então teremos o input para enviar mensagem ao chat que só será ativado após o usuário logar.

```html 
    <div class="row">
      <div id="control-row" class="col-xs-offset-2 col-xs-6">
        <div id="empty-container"></div>
        <div id="chat-controls-container">
          <input id="text" type="text" name="text" maxlength="256" placeholder="Sua mensagem" autocomplete="off" onkeyup="handleKey(event)"
            disabled>
          <button id="send" name="send" class="btn" onclick="handleSendButton()" disabled> 
              <span class="glyphicon glyphicon-send"></span>
            </button>
        </div>
      </div>
    </div>
```

## O Javascript

Então ao javascript. Para realizar essa conexão iremos ter o mesmo fluxo apresentado neste diagrama.  
![Flow](https://mdn.mozillademos.org/files/6119/webrtc-complete-diagram.png)  
O qual o "Usuário A" enviará uma oferta ao server com os dados SDP e para quem seria a oferta.  
Ao receber esta oferta o "Usuário B" envia uma resposta com os dados SDP dele para o server que envia ao "Usuário A".  
Com estes dados então, o WebRTC já verifica que tem uma negociação em andamento e ativa o Evento para adicionar um novo candidato ICE, então é feito o mesmo processo de envio ao server e então ao outro usuário e vice-versa.
Vamos ao código então.

### As váriaveis
Começaremos declarando as váriaveis

```javascript
    // Variaveis para o WebSocket
    var connection = null;
    var clientID = 0;
```
Variavéis utilizadas para configuração do WebSocket


```javascript
    //Fix para o chrome
    var isOfferer;
```
Utilizei este fix para resolver um problema do chrome que estava enviando ofertas em loop, ela server para verificar se quem enviou a oferta é o host da chamada.

```javascript
    // A variavel mediaConstraints descreve que tipo de stream nos iremos usar
    // Aqui, especificamos que usaremos os dois, audio e video.
    // Mas tambem podemos especificar outros parametros para recuperar o video em outras
    // resolucoes. E em dispositivos mobiles podemos especificar qual camera o usuario
    // deseja usar.
    var mediaConstraints = {
        audio: true, // Usaremos comunicacao de audio
        video: true // E tambem de video
        //video: {              // Especificamos esse para validar resolucoes da camera
        //width: { min: 1024, ideal: 1280, max: 1920 },
        //height: { min: 776, ideal: 720, max: 1080 }
        //}
        //video: { facingMode: "user" } // Camera Frontal
        //video: { facingMode: { exact: "environment" } } // Camera Traseira
    };
```
Utilizaremos a `mediaConstraints` para enviar no contrutor do `RTCPeerConnection`


```javascript
    var myUsername = null;
    var targetUsername = null; // Para armazenar o usuario remoto
    var myPeerConnection = null; // RTCPeerConnection
```
Armazenaremos o usuário local e o usuário remoto na chamada
`myPeerConnection` será a instancia quando criarmos a conexão pelo `RTCPeerConnection`
```javascript
    // Para trabalhar com ou sem addTrack() precisamos verificar se esta disponivel
    var hasAddTrack = false;
```
Outro fix para o chrome, o chrome utiliza o método depreciado `addStream` e o que é recomendado para uso hoje é o `addTrack()`.

Temos três métodos para log  
O `reportError` será utilizado para tratar exceptions.
```javascript
/**
 *  Metodo para log com horario atual
 * @param {string} text 
 */
function log(text) {
  var time = new Date();
  console.log("[" + time.toLocaleTimeString() + "] " + text);
}

/**
 *  Metodo para log de erro com horario atual
 * @param {string} text 
 */
function log_error(text) {
  var time = new Date();
  console.error("[" + time.toLocaleTimeString() + "] " + text);
}

// Detecta erros de report.
function reportError(errMessage) {
  log_error("Error " + errMessage.name + ": " + errMessage.message);
}
```

O principal método que fará a comunicação do server com o usuário é o sendToServer. ele receberá uma mensagem como parametro e enviará ao server.
```javascript
/**
 * Manda para o server um Objeto javascript convertendo em JSON 
 * com os valores: tipo de mensagem e a mensagem
 * @param {Object} msg 
 */
function sendToServer(msg) {
    var msgJSON = JSON.stringify(msg);
    log("Sending '" + msg.type + "' message: " + msgJSON);
    connection.send(msgJSON);
}
```

Então teremos o método para setar o usuário.
Este método é chamado quando o usuário digita o nome dele e envia no campo de usuário. Isso chamará o método `connect()` que será o proximo que iremos ver.
Ele enviará ao server uma mensagem do tipo `username` que o server fará a atribuição do usuário a seu username.
```javascript
/**
 * Quando a mensagem "id" for recebida, esse metodo ira enviar a mesma para os server
 * assosiando a sessao do usuario a um ID unico, em resposta esse metodo enviara
 * uma mensagem com o tipo "username" para setar o usuario a essa sessao
 */
function setUsername() {
  myUsername = document.getElementById("name").value;

  sendToServer({
    name: myUsername,
    date: Date.now(),
    id: clientID,
    type: "username"
  });
}
```

O próximo método é um pouco mais complexo e é o que fara a conexão funcionar adequadamente. irei dividir ele em tres partes.  

No inicio, declararemos váriaveis para detectar os comportamentos da URL.
`serverUrl` armazenará a URL final e `scheme` servirá pra detectar se é o protocolo é `https` ou `http`.

Vale ressaltar que para bom funcionamento de tudo é necessario uma conexão `https`

Como falado anteriormente, estarei utilizando o arquivo server.js que está hospedado no meu heroku, então onde está a URL para meu heroku, você pode alterar para onde está seu server.
```javascript 
function connect() {
  var serverUrl;
  var scheme = "ws";
  
  /**
   * Se for uma conexao HTTPS, estaremos seguro a usar WebSocket,
   * entao adicionaremos mais um s para a variavel "scheme"
   */
  if (document.location.protocol === "https:") {
    scheme += "s";
  }
  /**
   * Como estou usando o heroku para servir como server,
   * redicionaremos a pagina hospedada no heroku para fazer a conexao
   * Caso seu servidor esteja hospedado no localhost
   * pode apenas alterar para 
   * serverUrl = "http://localhost:6502"
   */
  serverUrl = scheme + "://webrtcmgl.herokuapp.com";
 
  /**
  * Atribuímos a conexão, um servidor websocket
  */
  connection = new WebSocket(serverUrl, "json");

  /**
   * Quando abrir a conexao, ira deixar os buttons de enviar e escrever habilitados
   * @callback evt
   */
  connection.onopen = function (evt) {
    document.getElementById("text").disabled = false;
    document.getElementById("send").disabled = false;
  };
```

Após iniciar o servidor, teremos os eventos do mesmo.  
Sempre que tiver alguma mensagem, disparará o evento `onmessage` para conseguirmos tratar ela.
```javascript
  /**
   * Sempre que tiver uma mensagem esse metodo sera ativado,
   * e aqui fica os casos para ser enviados ao server
   * como tipo "id", "username" como falado anteriormente
   * @callback evt
   */
  connection.onmessage = function (evt) {
    var chatFrameDocument = document.getElementById("chatbox").contentDocument;
    var text = "";
    var msg = JSON.parse(evt.data);
    log("Message received: ");
    console.dir(msg);
    var time = new Date(msg.date);
    var timeStr = time.toLocaleTimeString();
```
Em seguida podemos fazer um `switch` em cima do tipo dessa mensagem e assim chamar o método especifico para o tipo recebido.
```javascript
    switch (msg.type) {
      case "id":
        clientID = msg.id;
        setUsername(); // Como mostrado logo acima, assim que atribuido o ID é atribuído o usuário.
        break;

      case "username": // Quando é enviado o tipo username, renderiza esta mensagem.
        text = "<div style='font-family: sans-serif; padding: 5px; font-size: 16px; letter-spacing: 1.1px; color: rgba(50,50,50,.8)'><b>Usuário <em>" + msg.name + "</em> fez login em: " + timeStr + "</b><br></div>";
        break;

      case "message": // Será renderizado a mensagem no chat.
        text = "<div style='font-family: sans-serif; padding: 5px; font-size: 16px; letter-spacing: 1.1px; color: rgba(50,50,50,.8)'>(" + timeStr + ") <b>" + msg.name + "</b>: " + msg.text + "</div>";
        break;

      case "rejectusername": // Caso o usuário já esteja logado
        myUsername = msg.name;
        text = "<div style='font-family: sans-serif; padding: 5px; font-size: 16px; letter-spacing: 1.1px; color: rgba(50,50,50,.8)'><b>Seu usuário foi modificado para <em>" + myUsername +
          "</em> porque o nome que você escolhe está em uso</b><br> </div>";
        break;

      case "userlist": // Quando for atualizado a userlist este case será chamado
        handleUserlistMsg(msg);
        break;
        // Mensagens de sinal: aqui começa a negociação do WebRTC
      case "video-offer": // Convite para iniciar uma conferencia
        handleVideoOfferMsg(msg);
        break;

      case "video-answer": // Resposta quando o usuario remoto aceita a conferencia
        handleVideoAnswerMsg(msg);
        break;

      case "new-ice-candidate": // Quando um candidato ICE é recebido
        handleNewICECandidateMsg(msg);
        break;

      case "hang-up": // Quando o usuário deseja desligar a conexão
        handleHangUpMsg(msg);
        break;

        // Caso receba uma mensagem desconhecida
      default:
        log_error("Mensagem desconhecida recebida:");
        log_error(msg);
    }

    // Se tiver algo na variável "text" é porque alguma mensagem de texto foi enviada
    if (text.length) {
      chatFrameDocument.write(text);
      document.getElementById("chatbox").contentWindow.scrollByPages(1);
    }
  };
}
```

Quando clicado no botão de enviar do html, será disparado este método que enviará um texto do tipo mensagem para ser impresso no chat.

```javascript
/**
 * Quando clicar no button de enviar, irá construir a mensagem com seu tipo e enviar ao server.
 */
function handleSendButton() {
    var msg = {
        text: document.getElementById("text").value,
        type: "message",
        id: clientID,
        date: Date.now()
    };
    sendToServer(msg);
    document.getElementById("text").value = "";
}
```

Verifica se apertou enter para enviar uma mensagem no chat.
```javascript
/**
 * Quando enter for pressionado nós chamamos o método handleSendButton para transmitir o texto ao server.
 * @callback evt 
 */
function handleKey(evt) {
  if (evt.keyCode === 13 || evt.keyCode === 14) {
    if (!document.getElementById("send").disabled) {
      handleSendButton();
    }
  }
}
```
Logo então teremos o método que inicializará a conexão entre os dois usuários  
Estou utilizando servidores ICE que a internet disponibiliza para uso de graça.
Aqui atribuímos ao `myPerrConnection` uma instancia de `RTCPeerConnection` com os servers ICE e ativando as duas propriedades opcionais 

```javascript
/**
 * Cria a conexão RTC para se conectar com nossos servers STUN/TURN 
 * recebendo getUserMedia() para achar a camera e o microfone e adicionar a conexão de video conferencia
 */
function createPeerConnection() {
    log("Configurando conexão...");

    // servidores STUN/TURN para uso de testes.
    // new RTCPeerConnection(iceServers,optional);
    myPeerConnection = new RTCPeerConnection(
        {'iceServers': 
        [
            {urls: 
                [
                    "turn:173.194.72.127:19305?transport=udp",
                    "turn:[2404:6800:4008:C01::7F]:19305?transport=udp",
                    "turn:173.194.72.127:443?transport=tcp",
                    "turn:[2404:6800:4008:C01::7F]:443?transport=tcp"
                ],
                username: "CKjCuLwFEgahxNRjuTAYzc/s6OMT",
                credential: "u1SQDR/SQsPQIxXNWQT7czc/G4c="},
            {urls: ["stun:stun.l.google.com:19302"]}
        ]},
         {optional: 
            [
                {DtlsSrtpKeyAgreement: true},
                {RtpDataChannels: true}
            ]
         });
```

`iceServers` este objeto contem as urls para os servers TURN e STUN. Que são utilizados para criar a conexão escapando das restrições NAT e de firewalls

*`optional`* contém parametros opcionais para algumas conexões.  
`DtlsSrtpKeyAgreement` é necessário para o Firefox e o Chrome se comunicarem e interoperarem.  
`RtpDataChannels` precisamos ativar para utilizar a API DataChannels no firefox.

```javascript
    // Existe addTrack()? Caso não, iremos usar streams.
    hasAddTrack = (myPeerConnection.addTrack !== undefined);

    // Aqui atribuímos todos os eventos e suas funções.
    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.onremovestream = handleRemoveStreamEvent;
    myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
    // Como addStream() não é mais recomendado para uso, e o evento addTrack  
    // é o mais recomendado, precisamos usar ele caso addTrack() não 
    // estiver disponivel
    if (hasAddTrack) {
        myPeerConnection.ontrack = handleTrackEvent;
    } else {
        myPeerConnection.onaddstream = handleAddStreamEvent;
    }
```
`myPeerConnection.onicecandidate` disparará quando algum evento do tipo icecandidate aconteça instancia myPeerConnection.  
Ocorre quando um dos usuários precisa enviar uma mensage ao outro passando pelo server.  

`myPeerConnection.onremovestream` disparará quando por algum motivo a stream for removida, desligada, etc...

`myPeerConnection.oniceconnectionstatechange` disparará quando o estado da conexão ICE mude. Representado pela propriedade iceConnectionState.

`myPeerConnection.onicegatheringstatechange` disparará quando estiver reunindo os candidados, estaremos utilizando ela apenas para log.

`myPeerConnection.onsignalingstatechange` disparará sempre que tiver uma mudança no estado do sinal, ocorrendo durante todo processo de ofertas e respostas.

`myPeerConnection.onnegotiationneeded` disparará quando o WebRTC notar que é horar de criar ou reiniciar uma negociação ICE.

`myPeerConnection.ontrack` Disparará para adicionar as tracks de audio e vídeo.

`myPeerConnection.onaddstream` Disparará para adicionar as tracks de audio e vídeo mas no método depreciado.

E então começaremos a definir as funções atríbuidas aos eventos.  
Começamos com o evento quando detecta um novo candidato ICE.  
Envia ao server uma mensagem do tipo "new-ice-candidate" com o usuário que enviou e sua mensagem ICE.
```javascript
/**
 * Cria um novo candidato ICE enviando o mesmo para o server
 * @callback event 
 */
function handleICECandidateEvent(event) {
  if (event.candidate) {
    log("Enviando ICE candidate: " + event.candidate.candidate);

    sendToServer({
      type: "new-ice-candidate",
      target: targetUsername,
      candidate: event.candidate
    });
  }
}
```

Em seguida tempos o evento que caso a stream seja desativada, removida ou desligada, é chamado o método `closeVideoCall()`que tratará de desligar toda chamada

```javascript 
/**
 * Quando alguem finalizar a conexão, este evento é chamado, removendo assim sua mediastream.
 * @callback event 
 */
function handleRemoveStreamEvent(event) {
  log("*** Stream removido");
  closeVideoCall();
}
```

O método que cuida do estado da conexão ICE irá verificar se a conexão falhe, seja fechada ou disconectada e chamará o metódo `closeVideoCall()` para desligar a conexão.

```javascript
/**
 * Esse método é chamado quando o estado do ICE mudar
 * Caso aconteça algum erro na conexão do ICE a chamada será finalizada
 * 
 * @callback event 
 */
function handleICEConnectionStateChangeEvent(event) {
  log("*** estado do ICE connection mudado para: " + myPeerConnection.iceConnectionState);
  switch (myPeerConnection.iceConnectionState) {
    case "closed":
    case "failed":
    case "disconnected":
      closeVideoCall();
      break;
  }
}

```
Verificará quando o estado o sinal da conexão mudar, estaremos tratando apenas quando o sinal mudar para `"closed"` e `"have-local-offer"`.

`have-local-offer` ativaremos a variavel "isOfferer" para corrigir o bug no chrome, pois o mesmo ocorre quando o host da chamada envia uma oferta ao remoto, e o remoto responde com outra chamada sendo host.  
Com este tratamento, podemos verificar em um outro método se quem enviou a oferta é o host ou não.
```javascript 
/**
 * Esse evento irá detectar quando a conexão for fechada.
 * @callback event 
 */
function handleSignalingStateChangeEvent(event) {
  log("*** estado do WebRTC signaling mudado para: " + myPeerConnection.signalingState);
  switch (myPeerConnection.signalingState) {
    case "have-local-offer":
      isOfferer = true;
      break;
    case "closed":
      closeVideoCall();
      break;
  }
}
```

Como dito anteriormente, o estado do ICEGathering servirá só para log.
```javascript
/**
 * Detecta quando o ICE estiver reunindo os candidatos.
 * Estados:
 * "new" : significa que nenhuma network ocorreu ainda.
 * "gathering" : significa que está reunindo os candidados,
 * "complete" : significa que reuniu os candidatos.
 * 
 * Esta ferramenta pode ficar alternando entre gathering e complete repetidamente
 * conforme necessitar e as circunstancias mudar.
 * @callback event 
 */
function handleICEGatheringStateChangeEvent(event) {
  log("*** estado do ICE gathering mudado para: " + myPeerConnection.iceGatheringState);
}
```


Aqui então verificaremos quando a negociação for necessária,
criaremos uma oferta para enviar ao usuário remoto.  
Primeiramente irá atribuir a descrição SDP local, e retornar a mesma para a oferta a ser mandada ao usuário remoto.
```javascript
/**
 * Chamado pelo WebRTC para notificar que é hora de criar, ou reiniciar uma negociação ICE.
 * Inicia criando uma oferta, então atribui a mesma para a descrição da nossa midia local,
 * então envia a descrição para o chamado com o valor de uma oferta. Demonstrando o valor da midia,
 * formato, codec, resolução e etc...
 */
function handleNegotiationNeededEvent() {
  log("*** Negociação necessária");
  log("---> Criando oferta");
  myPeerConnection.createOffer()
    .then(function (offer) {
      log("---> Criando descrição para enviar ao usuário remoto");
      return myPeerConnection.setLocalDescription(offer);
    })
    .then(function () {
      log("---> Enviando oferta para o usuário");
      sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "video-offer",
        sdp: myPeerConnection.localDescription
      });
    })
    .catch(reportError);
}
```

Em seguida temos os dois métodos para adicionar a stream aos elementos de vídeo remoto, como dito anteriormente, Chrome utiliza addStream que está depreciado.
```javascript
/**
 * Chamado pelo WebRTC quando um evento ocorre nas midias que estão na conferência do WebRTC
 * É incluido quando streams são adicionados ou removidos da conferencia;
 * 
 * Este evento tem os seguintes campos
 * @callback event 
 * @callback RTCRtpReceiver       event.receiver
 * @callback MediaStreamTrack     event.track
 * @callback MediaStream[]        event.streams
 * @callback RTCRtpTransceiver    event.transceiver
 */
function handleTrackEvent(event) {
  log("*** Stream adicionado");
  document.getElementById("received_video").srcObject = event.streams[0];
  document.getElementById("hangup-button").disabled = false;
}

/**
 * Chamado pelo WebRTC uma chamada é respondida pelo usuário remoto
 * Podemos usar este evento para atualizar nossa   interface 
 * @callback event 
 */
function handleAddStreamEvent(event) {
  log("*** Stream adicionado");
  document.getElementById("received_video").srcObject = event.stream;
  document.getElementById("hangup-button").disabled = false;
}

```

Cuidaremos da lista de usuários através deste método, apenas receberá os usuários online por parametro e adicionará na div `"userlistbox"` e adicionando o evento de click para fazer uma chamada de video.
```javascript
/**
 * Manda a mensagem contando a lista de usuários,
 * Essa função popula a userlistbox com todos os nomes,
 * fazendo cada um clicavel para iniciar uma chamada de video
 * @param {Object} msg 
 */
function handleUserlistMsg(msg) {
  var i;

  var listElem = document.getElementById("userlistbox");

  while (listElem.firstChild) {
    listElem.removeChild(listElem.firstChild);
  }

  for (i = 0; i < msg.users.length; i++) {
    var item = document.createElement("li");
    item.appendChild(document.createTextNode(msg.users[i]));
    item.addEventListener("click", invite, false);

    listElem.appendChild(item);
  }
}
```


`closeVideoCall()` resetará todos eventos, parará as transmissões e fechará a conexão.
```javascript 
/**
 * Fecha a conexão RTC e reseta todas variaveis para que o usuario possa 
 * receber outra chamada se desejar.
 * Esse metodo é chamado se o usuario remoto desligar, o local desligar 
 * ou acontecer algum erro de conexão
 */
function closeVideoCall() {
  var remoteVideo = document.getElementById("received_video");
  var localVideo = document.getElementById("local_video");

  log("Desligando a chamada");

  if (myPeerConnection) {
    log("--> Cancelando conexão");
    myPeerConnection.onaddstream = null; // Para implementações antigas (Lembre-se, onaddstream não é mais recomendado para uso)
    myPeerConnection.ontrack = null; // Para novas implementações
    myPeerConnection.onremovestream = null;
    myPeerConnection.onnicecandidate = null;
    myPeerConnection.oniceconnectionstatechange = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    myPeerConnection.onnotificationneeded = null;

    // Parar os videos.
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    }

    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach(track => track.stop());
    }

    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    localVideo.removeAttribute("src");
    isOfferer = false;

    // Fechar a conexão
    myPeerConnection.close();
    myPeerConnection = null;
  }

  // Desabilitar o button de desligar
  document.getElementById("hangup-button").disabled = true;
  targetUsername = null;
}

```


Verifica quando o usuário remoto desliga a chamada e chama o método `closeVideoCall()`
```javascript
/**
 * Detecta quando o usuario remoto desligar a chamada.
 * @callback msg 
 */
function handleHangUpMsg(msg) {
  log("*** Recebido uma mensagem de hangup do outro usuário");

  closeVideoCall();
}

```

Envia ao server quando o usuário local desliga a chamada.
```javascript
/**
 * Quando é desligada a chamada, envia a mensagem do tipo "hang-up",
 * para o outro usuário, isso notifica que a outra conexão irá ser desligada
 * e a interface retornar para tela sem chamada
 */
function hangUpCall() {
  closeVideoCall();
  sendToServer({
    name: myUsername,
    target: targetUsername,
    type: "hang-up"
  });
}
```


Então temos o `invite` que é chamado quando o usuário clica em cima de outro na lista de usuários

Ele faz duas verificações, se o usuário está tentando ligar para sí mesmo, ou se já existe uma conexão em andamento. Caso passe nas duas ele cria uma conexão.  
Solicita o acesso as mídias locais e atribui ao elemento de vídeo do html.
```javascript
/**
 * Detecta quando é clicado em cima de um usuário, convidando o mesmo para uma chamada
 * de video.
 * @callback evt 
 */
function invite(evt) {
  log("Preparando o convite");
  if (myPeerConnection) {
    alert("Você não pode iniciar outra chamada ao mesmo tempo");
  } else {
    var clickedUsername = evt.target.textContent;

    if (clickedUsername === myUsername) {
      alert("Acredito que você não pode falar consigo mesmo, isso seria estranho.");
      return;
    }

    // Grava o usuario clicado para referencia futura
    targetUsername = clickedUsername;
    log("Convidando usuário: " + targetUsername);

    // Chama createPeerConnection() para inicializar a conexão com o usuário
    log("Configurando conexão para conectar com: " + targetUsername);
    createPeerConnection();

    // Configura o acesso as midias locais e adiciona a conexão
    log("Solicitando acesso a webcam...");

    navigator.mediaDevices.getUserMedia(mediaConstraints)
      .then(function (localStream) {
        log("-- Vídeo local obtido");
        document.getElementById("local_video").src = window.URL.createObjectURL(localStream);
        document.getElementById("local_video").srcObject = localStream;

        if (hasAddTrack) {
          log("-- Adicionado tracks ao PeerConnection");
          localStream.getTracks().forEach(track => myPeerConnection.addTrack(track, localStream));
        } else {
          log("-- Adicionado transmissão ao PeerConnection");
          myPeerConnection.addStream(localStream);
        }
      })
      .catch(handleGetUserMediaError);
  }
}
```

Após o método acima, o evento para aceitar a oferta é chamado no lado do usuário remoto, o qual verificará aquele bug do chrome que foi explicado anteriormente.

Neste método criaremos a descrição remota para enviar ao usuário local para que o mesmo possa receber a transmissão de vídeo também.
```javascript
/**
 * Aceita a oferta de video.
 * Configura as opções locais e cria a conexão local.
 * Após isso cria e envia uma resposta a quem ligou
 * @callback msg 
 */
function handleVideoOfferMsg(msg) {
  var localStream = null;

  targetUsername = msg.name;

  // Chama create PeerConnection para iniciar a conexão
  log("Aceitando convite de: " + targetUsername);
  createPeerConnection();

  // Precisamos atribuir nossa descrição remota para a oferta SDP recebida.
  // Então nosso WebRTC sabe como se comunicar com quem enviou a oferta
  if (!isOfferer) {
    var desc = new RTCSessionDescription(msg.sdp);
    myPeerConnection.setRemoteDescription(desc) // Pegará os valores das mídias locais para enviar ao usuário que iniciou a chamada
      .then(function () {
        log("Configurando midias locais.");
        return navigator.mediaDevices.getUserMedia(mediaConstraints);
      })
      .then(function (stream) {
        log("-- Vídeo local obtido");
        localStream = stream;
        document.getElementById("local_video").src = window.URL.createObjectURL(localStream);
        document.getElementById("local_video").srcObject = localStream;
        if (hasAddTrack) {
          log("-- Adicionado tracks ao PeerConnection");
          localStream.getTracks().forEach(track => myPeerConnection.addTrack(track, localStream));
        } else {
          log("-- Adicionado transmissão ao PeerConnection");
          myPeerConnection.addStream(localStream);
        }
      })
      .then(function () {
        log("--> Criando Resposta");
        // Agora que conseguimos criar uma descrição remota, precisamos iniciar 
        // a chamada local e então criar uma resposta SDP.
        // esses dados SDP descreve as informações da chamada, incluindo o codec,
        // e informações adicionais.
        return myPeerConnection.createAnswer();
      })
      .then(function (answer) {
        log("--> Atribuindo descrição local para resposta");
        // Tendo a resposta, estabilizamos como uma descrição local.
        // Isso configura o fim para que utilizaremos a chamada
        // especificado nas configurações do SDP
        return myPeerConnection.setLocalDescription(answer);
      })
      .then(function () {
        var msg = {
          name: myUsername,
          target: targetUsername,
          type: "video-answer",
          sdp: myPeerConnection.localDescription,
        };
        // Nós configuramos a resposta da chamada agora. 
        // Enviamos de volta para quem ligou para que ele saiba que queremos 
        // nos comunicar e como comunicaremos
        log("Enviando o pacote de volta ao outro usuário");
        sendToServer(msg);
      })
      .catch(handleGetUserMediaError);
  } else {
    isOfferer = false;

  }
}

```
Então o usuário local recebe a mensagem que o remoto aceitou.
Assim ele atribui a descrição remota dele.
```javascript

// Responde a mensagem do tipo "video-answer" enviada para quem ligou
// uma vez que chamada ela decide aceitar ou rejeitar a falar
function handleVideoAnswerMsg(msg) {
  log("O usuário aceitou sua chamada");

  // Configura a descrição remota, que contem em nossa mensagem "video-answer"
  var desc = new RTCSessionDescription(msg.sdp);
  myPeerConnection.setRemoteDescription(desc).catch(reportError);
}

```

Quando acontecer uma mensagem do tipo `"new-ice-candidate"` este método será acionado adicionando um novo candidato ICE a conexão
```javascript 
// Cria um novo candidato ICE enviado da outra conexão.
// Chama RTCPeerConnection.addIceCandidate() para enviar ao ICE framework local.
function handleNewICECandidateMsg(msg) {
  var candidate = new RTCIceCandidate(msg.candidate);

  log("Adicionando candidado ICE recebido: " + JSON.stringify(candidate));
  myPeerConnection.addIceCandidate(candidate)
    .catch(reportError);
}
```

Durante a detecção de mídias locais, se ocorrer um erro, este método será acionado e tratará das excessões, assim fechando a chamada.
```javascript
/**
 * Detecta erro que ocorre quanto tenta acessar as midias locais de video e audio
 * trata excessoes emitidas pelo getUserMedia().
 * @callback e 
 */
function handleGetUserMediaError(e) {
  log(e);
  switch (e.name) {
    case "NotFoundError":
      alert("Não foi possível realizar a ligação pois sua webcam e/ou microfone não está disponível");
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      // Não faça nada, pois é os mesmos quando o usuário desliga a chamada
      break;
    default:
      alert("Erro ao tentar abrir sua webcam e/ou microfone: " + e.message);
      break;
  }

  // Tenha certeza de fechar a chamada para que outra possa ocorrer
  closeVideoCall();
}
```




## Suporte 
|Browser| IE | EDGE | FIREFOX | CHROME | SAFARI | OPERA | IOS Safari | OPERA MINI | ANDROID BROWSER | CHROME FOR ANDROID |
|-------|----|------|---------|--------|--------|-------|------------|------------|-----------------|--------------------|
|Versão | -- |  15  | 55    |  60      |  11   |    47   |  11          |     --       |       56          |          59          |



Dados obtidos do site [CanIUse](https://caniuse.com/#search=WebRTC)