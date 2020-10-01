
import { interval, fromEvent, from, zip, Observable} from 'rxjs'
import { map, scan, filter, merge, flatMap, take, concat, last, takeUntil, switchMap, repeatWhen, takeWhile} from 'rxjs/operators'

function pong() {
    // Inside this function you will use the classes and functions 
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable exampels first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!  


    const svg = document.getElementById("canvas")!;

    //these values will remain the same during the game 
    const PLAYER_X = 575; // player paddle's x position
    const LEFTPADDLE_X = 20;// auto paddle's x position
    const PADDLE_WIDTH = 5;
    const PADDLE_HEIGHT = 70;
    const PADDLE_COLOUR = '#95B3D7';
    const INIT_PADDLE_Y = 265; // initially paddles are placed in the middle 
    const CANVAS_SIZE = 600;
    const MAX_SCORE = 7;
    const INITIAL_BALL_VX = 1;
    const INITIAL_BALL_VY = 3;
    const BALL_RADIUS = 5 
    const MAX_ANGLE =  Math.PI/3
    const MAX_SPEED = 4
    


    //construct left (auto) paddle
    const leftpaddle = document.createElementNS(svg.namespaceURI,'rect')
    Object.entries({
      x: LEFTPADDLE_X, y: INIT_PADDLE_Y,
      width: PADDLE_WIDTH, height: PADDLE_HEIGHT,
      fill: PADDLE_COLOUR,
    }).forEach(([key,val])=>leftpaddle.setAttribute(key,String(val)))
    svg.appendChild(leftpaddle);
    

    //construct right(player) paddle
    const player = document.createElementNS(svg.namespaceURI,'rect')
    Object.entries({
      x: PLAYER_X, y: INIT_PADDLE_Y,
      width: PADDLE_WIDTH, 
      height: PADDLE_HEIGHT,
      fill: PADDLE_COLOUR,
    }).forEach(([key,val])=>player.setAttribute(key,String(val)))
    svg.appendChild(player);


  //construct the centerline over the canvas 
    const centerline = document.createElementNS(svg.namespaceURI, 'rect')
    Object.entries({
      x: 299, y: 0,
      width: 1, 
      height: CANVAS_SIZE,
      fill: 'white',
    }).forEach(([key,val])=>centerline.setAttribute(key,String(val)))
    svg.appendChild(centerline);
    

    //construct the ping pong ball
    //initially, the pingpong is placed in the middle of the canvas 
    const pingpong = document.createElementNS(svg.namespaceURI,'circle')
    Object.entries({
      cx: CANVAS_SIZE/2, cy: CANVAS_SIZE/2, // place the pingpong in the middle 
      r:BALL_RADIUS,
      vx:INITIAL_BALL_VX, // x axis velocity
      vy:INITIAL_BALL_VY, // y axis velocity
      fill: 'white',
    }).forEach(([key,val])=>pingpong.setAttribute(key,String(val)))
    svg.appendChild(pingpong);

    // get the following html elements and modified them through out the game 
    const autoScore = document.getElementById('autoscore'); // display scores for left(auto) paddle 
    const playerScore = document.getElementById('playerscore');// display scores for right(player) paddle 
    const startbtn = document.getElementById("startbtn") // button to start the game 


    // define some useful types and classes : 

    // inspired by the asteroid code: https://tgdwyer.github.io/asteroids/

    //use a part of code in the asteroid code, this is vector class with two simple methods
    //used for storing the position/xyvelocity of the ball
    class Vec {
      constructor(public readonly x: number = 0, public readonly y: number = 0) {}
      add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
      transform = (f: (v: Vec)=> Vec) => f(this) // control the function f to return a new vec object to keep the purity 
    }

    // use the code from the asteroid code, a discrete timestep in our simulation, triggered by interval
    class Tick { constructor(public readonly elapsed:number) {} };
    
    // paddle move triggered by the mouseevent, 
    class PlayerMove{ constructor(public readonly y:number) {}};

    // for tracking mouse move:  
    type mouseLocation = { x: number, y: number};

    // the data that streams through out the game :
    type State = Readonly<{
      pos: Vec
      velocity: Vec,
      autoScore: number,
      playerScore: number,
      lpaddleY:number,
      rpaddleY:number
    }>

    // for indicating the side of the paddle, since difference side has different logic to process/transform the state 
    type Side = "Left" | "Right";

    // defines initial values for all the attributes 
    const initialState: State = {
      pos: new Vec(CANVAS_SIZE/2,CANVAS_SIZE/2),
      velocity: new Vec(1,3),
      autoScore: 0,
      playerScore: 0,
      lpaddleY:INIT_PADDLE_Y,
      rpaddleY:INIT_PADDLE_Y
    }

  //define some useful functions: 

  /**
   * This function is for transforming an element.
   * @param ele 
   * @param f fucntion to transform ele 
   * @return transformed ele (new ele object if f is pure/ T is primitive type)
   */
    function  transform<T>(ele: T, f:(ele: T)=>T):T {
      return f(ele);
    }

  /**
     * This function is for determing if any of the player wins the game.
     * @param player1
     * @param player2
     * @param condition winning condition 
     * @return true if one player wins 
     */
    function oneWins<T>(player1: T, player2: T, condition:(T)=>boolean){
      return condition(player1) || condition(player2);
    }

 /**
     * This function is for determing if the mouse is within canvas.
     * @param mouseLocation x y location 
     * @return true if the location is within canvas 
     */
    const inCanvas = ({ x, y }: mouseLocation):boolean => 
    x > svg.getBoundingClientRect().x 
    &&x < svg.getBoundingClientRect().x + CANVAS_SIZE
    && y> svg.getBoundingClientRect().y 
    && y <=svg.getBoundingClientRect().y+ svg.clientHeight; 
  
 /**
     * This function is for determing if the ball is hitted by a paddle
     * @param ballvec the location of the ball
     * @param paddleY the y location of the paddle 
     * @param paddleside side of the paddle  
     * @return true if the ball is hitted by a paddle
     */
    const hitByPaddle = (ballvec: Vec, paddleY: number , paddleside:Side): boolean => 
      paddleside == "Left"?  
      ballvec.x - BALL_RADIUS>= LEFTPADDLE_X  && (ballvec.x - BALL_RADIUS) <= (LEFTPADDLE_X + PADDLE_WIDTH )
      && ballvec.y >= paddleY && ballvec.y <= (paddleY + PADDLE_HEIGHT)
      : ballvec.x + BALL_RADIUS>= PLAYER_X && (ballvec.x + BALL_RADIUS) <= (PLAYER_X + PADDLE_WIDTH )
      && ballvec.y >= paddleY && ballvec.y <= (paddleY+  PADDLE_HEIGHT)


 /**
     * This function is for determing if the ball is hitted by the upper/bottom wall
     * @param ballvec the location of the ball
     * @param ballVel ball velocity
     * @return true if the ball is hitted by the upper/bottom wall
     */
      
    const hitByWall = (ballVec: Vec, ballVel: Vec):boolean => 
    (ballVel.y < 0  && ballVec.y - BALL_RADIUS <= 0) || (ballVel.y > 0 && ballVec.y + BALL_RADIUS >= CANVAS_SIZE);
      

   /**
     * This function is for calculating the velocity of the ball depending on what part of a paddle the ball strikes
     * @param cy the ball's y location
     * @param y paddle's y location
     * @param side side of the paddle 
     * @return new vec object calculated by the above condition
     */
    const transformVel = (cy: number,y: number , side: Side): Vec =>{
      const dToPCentre = (cy: number, y: number ):number => y + PADDLE_HEIGHT/2 - cy;
      const bounceAngle = (cy: number, y: number ): number => (dToPCentre(cy,y)/(PADDLE_HEIGHT/2))* MAX_ANGLE;
      const angle = bounceAngle(cy,y);
      return side === "Left" ?  
      new Vec(MAX_SPEED*Math.cos(angle), -1 *MAX_SPEED * Math.sin(angle))
      : new Vec(-1*MAX_SPEED*Math.cos(angle), -1*MAX_SPEED * Math.sin(angle))
      
    }

   /**
     * This function is for transfoming the auto paddle's location depending on the location of the ball
     * @param ballvec the location of the ball
     * @param y paddle's y location
     * @return new auto paddle's y location
     */

    const transformAutoPaddle = (ballvec: Vec, y: number): number =>{
      const paddleYWrap = (n: number):number => n< 0 ? 0 : n > (CANVAS_SIZE-PADDLE_HEIGHT) ? CANVAS_SIZE-PADDLE_HEIGHT : n;
      return ballvec.y < y? paddleYWrap(y - 4): ballvec.y > y+PADDLE_HEIGHT? paddleYWrap(y+4): y
    }
    
  /**
     * This function is for checking if one paddle misses the ball 
     * @param ballx the x location of the ball
     * @param side side of the paddle  
     * @return true if one paddle misses the ball 
     */

    const missHit=(ballx: number, side: Side): boolean => side === "Left" ? ballx - BALL_RADIUS <= 0 : ballx + BALL_RADIUS >= CANVAS_SIZE;
    
  /**
     * This function is for transforming the state depending on the event type
     * @param s previous state 
     * @param e event 
     * @return new state object calculated by the previous state and the event type  
     */

    const reduceState = (s:State, e:PlayerMove|Tick) :State=> {
      if(e instanceof PlayerMove){
        return {...s,
          rpaddleY: e.y- svg.getBoundingClientRect().y - PADDLE_HEIGHT/2 // move right paddle pos as the user move the mouse 
        }
      }else{ // for every tick : 
        const autoScored = missHit(s.pos.x, "Right") ; //if the player missed the ball, the left side (auto) scored 
        const playerScored = missHit(s.pos.x, "Left") ;//if the auto paddle missed the ball, player scored 

        return {...s,
          // if any side scored, place the ball in the middle, otherwise move the ball depends on the velocity for every tick  
          pos: autoScored || playerScored? new Vec(CANVAS_SIZE/2, CANVAS_SIZE/2): s.pos.add(s.velocity),

          // if any side scored, reset the velocity, otherwise change the velocity when the ball strikes a paddle/ the wall 
          // if nothing happened, velocity remains the same
          velocity: autoScored? new Vec(INITIAL_BALL_VX,INITIAL_BALL_VY): playerScored? new Vec(-1*INITIAL_BALL_VX,INITIAL_BALL_VY)
          :hitByPaddle(s.pos, s.lpaddleY, "Left")? 
          transformVel(s.pos.y, s.lpaddleY, "Left")
          :hitByPaddle(s.pos, s.rpaddleY, "Right")? 
          transformVel(s.pos.y, s.rpaddleY,"Right")
          :hitByWall(s.pos, s.velocity)? 
          s.velocity.transform((v)=> new Vec(v.x, -1*v.y ))
          :s.velocity,

          // left paddle transformed for every tick 
          lpaddleY: transformAutoPaddle(s.pos, s.lpaddleY),

          //score a side side if one player missed the ball 
          autoScore: autoScored? transform(s.autoScore, (n)=> n+1 ): s.autoScore,
          playerScore: playerScored ? transform(s.playerScore, (n)=> n+1): s.playerScore

        }
      }
    }
    // a stream for the mouse event, it streams the location of the mouse when the mouse is within canvas 
    const mousemove$ = fromEvent<MouseEvent>(document, "mousemove").
    pipe(map(({ clientX, clientY }):mouseLocation => ({ x: clientX, y: clientY })), filter(loc =>
      inCanvas(loc) 
      &&  loc.y <= svg.getBoundingClientRect().y + CANVAS_SIZE - PADDLE_HEIGHT/2 
      && loc.y >= svg.getBoundingClientRect().y + (PADDLE_HEIGHT/2 )
    ), map(loc => new PlayerMove(loc.y)));


    //click the start button to sart the game
    fromEvent<MouseEvent>(startbtn, "click").subscribe(_=>{

      // clean up from the previous game session:
      startbtn.style.visibility = 'hidden';
      document.getElementById('announcement').textContent= "";

      // for updating the user view ( html)
      const updateView = (s: State): void =>{
        player.setAttribute('y', String(s.rpaddleY ));
        leftpaddle.setAttribute('y', String(s.lpaddleY ));
        pingpong.setAttribute('cx', String(s.pos.x));
        pingpong.setAttribute('cy', String(s.pos.y));
        autoScore.textContent = String(s.autoScore);
        playerScore.textContent = String(s.playerScore);

        // if one player reaches the max score, end the game and announce the winner 
        if(oneWins(s.autoScore, s.playerScore, (p)=>p===MAX_SCORE)){
          subscription.unsubscribe();
          document.getElementById('announcement').innerHTML = s.autoScore === MAX_SCORE? "You lose :(" : "You win :)" ;
          startbtn.style.visibility = 'visible'; 
        }
  
      }

      // main code for running the game, merge with the mousemove stream to track player's movement of the paddle 
      // every 10 milliseconds or whenevr the player move the paddle, update the user view (html) 
      const subscription = interval(10).pipe(map(elapsed=>new Tick(elapsed)), 
      merge(mousemove$),scan(reduceState, initialState)).subscribe(updateView);
    })
     
}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      pong();
    }
  