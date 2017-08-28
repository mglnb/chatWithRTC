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

## Tirando Fotos com WebRTC
### CÓDIGO HTML
Nosso front-end tem dois separadores principais: o painel da transmissão, o da captura e o da apresentação.

O primeiro painel contém dois componentes: `video` onde irá receber a transmissão do WebRTC, e um `button` onde o usuário ira clicar para capturar a foto.
```html
    <div class="camera">
        <video id="video">Vídeo não dísponivel</video>
        <button id="startbutton">Tirar Foto</button>
    </div>
```
Após nós temos um `<canvas>=`que irá armazenar a foto, podendo sendo manipulada de alguma maneira, e sendo convertida em um arquivo para download. Esse `canvas` estará escondido através do `display:none`, para evitar quebrar o layout

Teremos também um `<img>` onde será desenhado a imagem e apresentado ao usuário final.

```html
    <canvas id="canvas">
    </canvas>
    <div class="output">
        <img id="photo" alt="A imagem que for capturada irá aparecer nesta caixa">
    </div>

```

### CÓDIGO JAVASCRIPT
Podemos iniciar o script com uma função anônima para evitar variáveis globais, então inicializando as variaveis que iremos usar.

```javascript 
(function() {
    var width = 320; // Independente do tamanho do video, vamos deixar ele com 320px de width
    var height = 0; // O Height do video vai ser computado através do width.
    
    var streaming = false; // Indica se estamos ou não em uma transmissão ativa 
    var video = null; // Referenciará o elemento <video>
    var canvas = null; // Referenciará o elemento <canvas>
    var photo = null; // Referenciará o elemento <img>
    var startbutton = null; // Referenciará o elemento <button>
```

#### Init function
A função `init()`é chamada quando a pagina termina de carregar.
```javascript
function init() {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    photo = document.getElementById('photo');
    startbutton = document.getElementById('startbutton');
```

#### Pegar a transmissão das mídias.
Estaremos então chamando o MediaDevices.getUserMedia() para requisitar a transmissão de video (sem áudio). Isso retornara uma `promise` que acionara callbacks para sucesso ou para falha.

```javascript 
navigator.mediaDevices.getUserMedia({
    video:true, // Queremos receber apenas o video.
    audio:false
}).then(function(stream) {
    video.srcObject = stream; // Atribuímos ao elemento <video> o atributo src com a stream.
    video.play();
}).catch(function(err) {
    console.log("Um erro ocorreu: " + err);
})
```


Após chamar o `HTMLMediaElement.play()` na tag `<video>` há um periodo de tempo que pode ficar sem video até que o mesmo comece. Para evitar essa quebra, adicionamos um `EventListener` no `<video>`, `canplay`, que será chamado quando o video começar realmente. Nesse ponto, o elemento `video` já deve ter sido configurado com a transmissão.

```javascript
video.addEventListener('canplay', function(ev){
      if (!streaming) {
        height = video.videoHeight / (video.videoWidth/width);
      
        video.setAttribute('width', width);
        video.setAttribute('height', height);
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        streaming = true;
      }
    }, false);
```
Esse `callback` não faz nada a menos que seja a primeira vez que ele seja chamado. Veja que se a variavel `streaming` for `false` ele atribuira `true` a mesma e não rodará mais o código

#### Start Button
Para capturar a foto toda vez que o usuário clicar no botão, precisamos adicionar um `EventListener` ao mesmo, para que seja chamado quando o evento de click for ativado.

```javascript 
startbutton.addEventListener('click', function(ev){
      takepicture();
      ev.preventDefault();
    }, false);
```

Precisamos adicionar mais duas linha ao método `init()` que foi criado lá no inicio.

```javascript 
clearphoto();
}
```

E agora estaremos declarando o método para "limpar" a imagem convertendo a um formato usável no elemento `<img>.

```javascript
function clearphoto() {
    var context = canvas.getContext('2d');
    context.fillStyle = "#AAA";
    context.fillRect(0, 0, canvas.width, canvas.height);

    var data = canvas.toDataURL('image/png');
    photo.setAttribute('src', data);
  }
```
Nós iniciamos pegando a referencia do `<canvas>` 

        TO DO




## Suporte 
|Browser| IE | EDGE | FIREFOX | CHROME | SAFARI | OPERA | IOS Safari | OPERA MINI | ANDROID BROWSER | CHROME FOR ANDROID |
|-------|----|------|---------|--------|--------|-------|------------|------------|-----------------|--------------------|
|Versão | -- |  15  | 55    |  60      |  11   |    47   |  11          |     --       |       56          |          59          |



Dados obtidos do site [CanIUse](https://caniuse.com/#search=WebRTC)



