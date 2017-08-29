"use strict";

// Pegar o valor do host

var myHostname = window.location.hostname;
console.log("Hostname: " + myHostname);

// Variaveis para o WebSocket

var connection = null;
var clientID = 0;

// A variavel mediaConstraints descreve que tipo de stream nos iremos usar
// Aqui, especificamos que usaremos os dois, audio e video.
// Mas tambem podemos especificar outros parametros para recuperar o video em outras
// resolucoes. E em dispositivos mobiles podemos especificar qual camera o usuario
// deseja usar.
//
// See also:
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints
// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
//

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

var myUsername = null;
var targetUsername = null; // Para armazenar o usuario remoto
var myPeerConnection = null; // RTCPeerConnection


// Para trabalhar com ou sem addTrack() precisamos verificar se esta disponivel
var hasAddTrack = false;


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

/**
 * Manda para o server um Objeto javascript convertendo em JSON 
 * com os valores: tipo de mensagem e a mensagem
 * @param {string} msg 
 */
function sendToServer(msg) {
  var msgJSON = JSON.stringify(msg);

  log("Sending '" + msg.type + "' message: " + msgJSON);
  connection.send(msgJSON);
}

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

/**
 * Configuracao do server WebSocket
 */
function connect() {
  var serverUrl;
  var scheme = "ws";

  // If this is an HTTPS connection, we have to use a secure WebSocket
  // connection too, so add another "s" to the scheme.

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
   */
  serverUrl = scheme + "://webrtcmgl.herokuapp.com";

  connection = new WebSocket(serverUrl, "json");

  /**
   * Quando abrir a conexao, ira deixar os buttons de enviar e escrever habilitados
   * @callback evt
   */
  connection.onopen = function (evt) {
    document.getElementById("text").disabled = false;
    document.getElementById("send").disabled = false;
  };

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

    switch (msg.type) {
      case "id":
        clientID = msg.id;
        setUsername();
        break;

      case "username":
        text = "<b>Usuário <em>" + msg.name + "</em> fez login em: " + timeStr + "</b><br>";
        break;

      case "message":
        text = "<div class='msg'>(" + timeStr + ") <b>" + msg.name + "</b>: " + msg.text + "</div>";
        break;

      case "rejectusername":
        myUsername = msg.name;
        text = "<b>Seu usuário foi modificado para <em>" + myUsername +
          "</em> porque o nome que você escolhe está em uso</b><br>";
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

/**
 * Cria a conexão RTC para se conectar com nossos servers STUN/TURN 
 * recebendo getUserMedia() para achar a camera e o microfone e adicionar a conexão de video conferencia
 */
function createPeerConnection() {
  log("Setting up a connection...");

  // servidores STUN/TURN para uso de testes.

  function createPeerConnection() {
    log("Setting up a connection...");

    // servidores STUN/TURN para uso de testes.
    var servers = {
      'iceServers': [{
          urls: 'stun:stun01.sipphone.com'
        },
        {
          urls: 'stun:stun.ekiga.net'
        },
        {
          urls: 'stun:stun.fwdnet.net'
        },
        {
          urls: 'stun:stun.ideasip.com'
        },
        {
          urls: 'stun:stun.iptel.org'
        },
        {
          urls: 'stun:stun.rixtelecom.se'
        },
        {
          urls: 'stun:stun.schlund.de'
        },
        {
          urls: 'stun:stun.l.google.com:19302'
        },
        {
          urls: 'stun:stun1.l.google.com:19302'
        },
        {
          urls: 'stun:stun2.l.google.com:19302'
        },
        {
          urls: 'stun:stun3.l.google.com:19302'
        },
        {
          urls: 'stun:stun4.l.google.com:19302'
        },
        {
          urls: 'stun:stunserver.org'
        },
        {
          urls: 'stun:stun.softjoys.com'
        },
        {
          urls: 'stun:stun.voiparound.com'
        },
        {
          urls: 'stun:stun.voipbuster.com'
        },
        {
          urls: 'stun:stun.voipstunt.com'
        },
        {
          urls: 'stun:stun.voxgratia.org'
        },
        {
          urls: 'stun:stun.xten.com'
        },
        {
          urls: 'turn:numb.viagenie.ca',
          credential: 'muazkh',
          username: 'webrtc@live.com'
        },
        {
          urls: 'turn:192.158.29.39:3478?transport=udp',
          credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
          username: '28224511:1379330808'
        },
        {
          urls: 'turn:192.158.29.39:3478?transport=tcp',
          credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
          username: '28224511:1379330808'
        }
      ]
    };

    var options = {
      optional: [{
          DtlsSrtpKeyAgreement: true
        },
        {
          RtpDataChannels: true
        }
      ]
    }
  }
    myPeerConnection = new RTCPeerConnection(servers, options);

    // Existe addTrack()? Caso não, iremos usar streams.
    hasAddTrack = (myPeerConnection.addTrack !== undefined);


    // Atribuindo os handlers para os metodos de negociação do ICE
    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.onnremovestream = handleRemoveStreamEvent;
    myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;


    // Como addStream() não é mais recomendado para uso, e o evento addTrack() é recente,
    // Precisamos usar ele caso addTrack() não estiver disponivel
    if (hasAddTrack) {
      myPeerConnection.ontrack = handleTrackEvent;
    } else {
      myPeerConnection.onaddstream = handleAddStreamEvent;
    }
  }

  // Called by the WebRTC layer to let us know when it's time to
  // begin (or restart) ICE negotiation. Starts by creating a WebRTC
  // offer, then sets it as the description of our local media
  // (which configures our local media stream), then sends the
  // description to the callee as an offer. This is a proposed media
  // format, codec, resolution, etc.
  /**
   * Chamado pelo WebRTC para notificar que é hora de criar, ou reiniciar uma negociação ICE.
   * Inicia criando uma oferta, então atribui a mesma para a descrição da nossa midia local,
   * então envia a descrição para o chamado com o valor de uma oferta. Demonstrando o valor da midia,
   * formato, codec, resolução e etc...
   */
  function handleNegotiationNeededEvent() {
    log("*** Negotiation needed");

    log("---> Creating offer");
    myPeerConnection.createOffer().then(function (offer) {
        log("---> Creating new description object to send to remote peer");
        return myPeerConnection.setLocalDescription(offer);
      })
      .then(function () {
        log("---> Sending offer to remote peer");
        sendToServer({
          name: myUsername,
          target: targetUsername,
          type: "video-offer",
          sdp: myPeerConnection.localDescription
        });
      })
      .catch(reportError);
  }


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
    log("*** Stream adicionada");
    document.getElementById("received_video").srcObject = event.streams[0];
    document.getElementById("hangup-button").disabled = false;
  }

  /**
   * Chamado pelo WebRTC uma chamada é respondida pelo usuário remoto
   * Podemos usar este evento para atualizar nossa interface 
   * @callback event 
   */
  function handleAddStreamEvent(event) {
    log("*** Stream adicionado");
    document.getElementById("received_video").srcObject = event.stream;
    document.getElementById("hangup-button").disabled = false;
  }

  /**
   * Quando alguem finalizar a conexão, este evento é chamado, removendo assim sua mediastream.
   * @callback event 
   */
  function handleRemoveStreamEvent(event) {
    log("*** Stream removido");
    closeVideoCall();
  }

  /**
   * Cria um novo candidato ICE enviando o mesmo para o server
   * @callback event 
   */
  function handleICECandidateEvent(event) {
    if (event.candidate) {
      log("Outgoing ICE candidate: " + event.candidate.candidate);

      sendToServer({
        type: "new-ice-candidate",
        target: targetUsername,
        candidate: event.candidate
      });
    }
  }

  /**
   * Esse método é chamado quando o estado do ICE mudar
   * Caso aconteça algum erro na conexão do ICE a chamada será finalizada
   * 
   * @callback event 
   */
  function handleICEConnectionStateChangeEvent(event) {
    log("*** ICE connection state changed to " + myPeerConnection.iceConnectionState);

    switch (myPeerConnection.iceConnectionState) {
      case "closed":
      case "failed":
      case "disconnected":
        closeVideoCall();
        break;
    }
  }

  /**
   * Esse evento irá detectar quando a conexão for fechada.
   * @callback event 
   */
  function handleSignalingStateChangeEvent(event) {
    log("*** WebRTC signaling state changed to: " + myPeerConnection.signalingState);
    switch (myPeerConnection.signalingState) {
      case "closed":
        closeVideoCall();
        break;
    }
  }

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
    log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
  }

  // Given a message containing a list of usernames, this function
  // populates the user list box with those names, making each item
  // clickable to allow starting a video call.

  /**
   * Manda a mensagem contando a lista de usuários,
   * Essa função popular a userlistbox com todos os nomes,
   * fazendo cada um clicavel para iniciar uma chamada de video
   * @callback msg 
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

  // Close the RTCPeerConnection and reset variables so that the user can
  // make or receive another call if they wish. This is called both
  // when the user hangs up, the other user hangs up, or if a connection
  // failure is detected.
  /**
   * Fecha a conexão RTC e reseta todas variaveis para que o usuario possa 
   * receber outra chamada se desejar.
   * Esse metodo é chamado se o usuario remoto desligar, o local desligar 
   * ou acontecer algum erro de conexão
   */
  function closeVideoCall() {
    var remoteVideo = document.getElementById("received_video");
    var localVideo = document.getElementById("local_video");

    log("Closing the call");

    if (myPeerConnection) {
      log("--> Closing the peer connection");

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

      remoteVideo.src = null;
      localVideo.src = null;

      // Fechar a conexão

      myPeerConnection.close();
      myPeerConnection = null;
    }

    // Desabilitar o button de desligar
    document.getElementById("hangup-button").disabled = true;
    targetUsername = null;
  }

  /**
   * Detecta quando o usuario remoto desligar a chamada.
   * @callback msg 
   */
  function handleHangUpMsg(msg) {
    log("*** Received hang up notification from other peer");

    closeVideoCall();
  }

  // Hang up the call by closing our end of the connection, then
  // sending a "hang-up" message to the other peer (keep in mind that
  // the signaling is done on a different connection). This notifies
  // the other peer that the connection should be terminated and the UI
  // returned to the "no call in progress" state.
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

  /**
   * Detecta quando é clicado em cima de um usuário, convidando o mesmo para uma chamada
   * de video.
   * @callback evt 
   */
  function invite(evt) {
    log("Starting to prepare an invitation");
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
      log("Inviting user " + targetUsername);

      // Chama createPeerConnection() para inicializar a conexão com o usuário

      log("Setting up connection to invite user: " + targetUsername);
      createPeerConnection();

      // Configura o acesso as midias locais e adiciona a conexão
      log("Requesting webcam access...");

      navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(function (localStream) {
          log("-- Local video stream obtained");
          document.getElementById("local_video").src = window.URL.createObjectURL(localStream);
          document.getElementById("local_video").srcObject = localStream;

          if (hasAddTrack) {
            log("-- Adding tracks to the RTCPeerConnection");
            localStream.getTracks().forEach(track => myPeerConnection.addTrack(track, localStream));
          } else {
            log("-- Adding stream to the RTCPeerConnection");
            myPeerConnection.addStream(localStream);
          }
        })
        .catch(handleGetUserMediaError);
    }
  }

  // Accept an offer to video chat. We configure our local settings,
  // create our RTCPeerConnection, get and attach our local camera
  // stream, then create and send an answer to the caller.
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

    log("Starting to accept invitation from " + targetUsername);
    createPeerConnection();

    // Precisamos atribuir nossa descrição remota para a oferta SDP recebida.
    // Então nosso WebRTC sabe como se comunicar com quem enviou a oferta
    var desc = new RTCSessionDescription(msg.sdp);

    myPeerConnection.setRemoteDescription(desc).then(function () {
        log("Setting up the local media stream...");
        return navigator.mediaDevices.getUserMedia(mediaConstraints);
      })
      .then(function (stream) {
        log("-- Local video stream obtained");
        localStream = stream;
        document.getElementById("local_video").src = window.URL.createObjectURL(localStream);
        document.getElementById("local_video").srcObject = localStream;

        if (hasAddTrack) {
          log("-- Adding tracks to the RTCPeerConnection");
          localStream.getTracks().forEach(track =>
            myPeerConnection.addTrack(track, localStream)
          );
        } else {
          log("-- Adding stream to the RTCPeerConnection");
          myPeerConnection.addStream(localStream);
        }
      })
      .then(function () {
        log("------> Creating answer");
        // Agora que conseguimos criar uma descrição remota, precisamos iniciar 
        // a chamada local e então criar uma resposta SDP.
        // esses dados SDP descreve as informações da chamada, incluindo o codec,
        // e informações adicionais.
        return myPeerConnection.createAnswer();
      })
      .then(function (answer) {
        log("------> Setting local description after creating answer");
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
          sdp: myPeerConnection.localDescription
        };

        // Nós configuramos o fim da chamada agora. 
        // Enviamos de volta para quem ligou para que ele saiba que queremos 
        // nos comunicar e como comunicaremos
        log("Sending answer packet back to other peer");
        sendToServer(msg);
      })
      .catch(handleGetUserMediaError);
  }

  // Responde a mensagem do tipo "video-answer" enviada para quem ligou
  // uma vez que chamada ela decide aceitar ou rejeitar a falar
  function handleVideoAnswerMsg(msg) {
    log("O usuário aceitou sua chamada");

    // Configura a descrição remota, que contem em nossa mensagem "video-answer"
    var desc = new RTCSessionDescription(msg.sdp);
    myPeerConnection.setRemoteDescription(desc).catch(reportError);
  }

  // Cria um novo candidato ICE enviado da outra conexão.
  // Chama RTCPeerConnection.addIceCandidate() para enviar ao ICE framework local.
  function handleNewICECandidateMsg(msg) {
    var candidate = new RTCIceCandidate(msg.candidate);

    log("Adding received ICE candidate: " + JSON.stringify(candidate));
    myPeerConnection.addIceCandidate(candidate)
      .catch(reportError);
  }

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

  // Detecta erros de report.
  function reportError(errMessage) {
    log_error("Error " + errMessage.name + ": " + errMessage.message);
  }