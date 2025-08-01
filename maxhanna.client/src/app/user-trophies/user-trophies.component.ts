import { Component, Input, OnInit } from '@angular/core';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { UserService } from '../../services/user.service';
import { Trophy } from '../../services/datacontracts/user/trophy';

@Component({
  selector: 'app-user-trophies',
  standalone: false,
  templateUrl: './user-trophies.component.html',
  styleUrl: './user-trophies.component.css'
})
export class UserTrophiesComponent extends ChildComponent {
  constructor() {super();}  
  @Input() inputtedParentRef?: AppComponent | undefined; 
  @Input() trophies?: Trophy[] = undefined;

  trophyDescriptions: { [key: string]: string } = {
    'Novice Trader': 'Executed 5 or more trades with the tradebot.',
    'Active Trader': 'Executed 25 or more trades with the tradebot.',
    'Frequent Trader': 'Executed 100 or more trades with the tradebot.',
    'Trade Addict': 'Executed 500 or more trades with the tradebot.',
    'Trade Master': 'Executed 1000 or more trades with the tradebot.', 
    '$100 Portfolio': 'Achieved a portfolio value of $100 or more.',
    '$1K Portfolio': 'Achieved a portfolio value of $1,000 or more.',
    '$10K Portfolio': 'Achieved a portfolio value of $10,000 or more.',
    '$100K Portfolio': 'Achieved a portfolio value of $100,000 or more.', 
    'DCA Strategist': 'Executed 10 or more Dollar-Cost Averaging (DCA) strategy trades.',
    'BTC Veteran': 'Executed 10 or more trades involving Bitcoin (BTC).',
    'ETH Veteran': 'Executed 10 or more trades involving Ethereum (ETH).',
    'Altcoin Explorer': 'Executed 10 or more trades involving altcoins (non-BTC/ETH).', 
    'First Profit': 'Achieved a positive net profit from trading.',
    'Consistent Profits': 'Had 5 or more days with positive trading profits.', 
    '7-Day Streak': 'Traded on 7 or more consecutive days.',
    '30-Day Streak': 'Traded on 30 or more consecutive days.',
    'Year-Round Trader': 'Traded in every month of the year.',
    'Chat Master 50': 'Sent 50 or more messages in the chat.',
    'Chat Master 100': 'Sent 100 or more messages in the chat.',
    'Chat Master 150': 'Sent 150 or more messages in the chat.',
    'Uploader 50': 'Uploaded 50 or more files.',
    'Uploader 100': 'Uploaded 100 or more files.',
    'Uploader 150': 'Uploaded 150 or more files.',
    'Topic Creator 1': 'Created 1 or more topics.',
    'Topic Creator 3': 'Created 3 or more topics.',
    'Topic Creator 10': 'Created 10 or more topics.',
    'Social Poster 10': 'Posted 10 or more stories.',
    'Social Poster 50': 'Posted 50 or more stories.',
    'Social Poster 100': 'Posted 100 or more stories.',
    'Bug Wars Ensign': 'Controlled 1 or more nexus bases in Bug Wars.',
    'Bug Wars Chief': 'Controlled 5 or more nexus bases in Bug Wars.',
    'Bug Wars Commander': 'Controlled 15 or more nexus bases in Bug Wars.',
    'Bug Wars Colonel': 'Controlled 150 or more nexus bases in Bug Wars.',
    'Bug Wars General': 'Controlled 1500 or more nexus bases in Bug Wars.',
    'Bug Wars Emperor': 'Controlled 2500 or more nexus bases in Bug Wars.',
    '2024 User': 'Active user in the year 2024.',
    '2025 User': 'Active user in the year 2025.',
    '2026 User': 'Active user in the year 2026.',
    '2027 User': 'Active user in the year 2027.',
    '2028 User': 'Active user in the year 2028.',
    '2029 User': 'Active user in the year 2029.',
    'Array Scout': 'Reached a position beyond 10 in Array.',
    'Array Navigator': 'Reached a position beyond 100 in Array.',
    'Array Pathfinder': 'Reached a position beyond 1000 in Array.',
    'Array Voyager': 'Reached a position beyond 10000 in Array.',
    'Array Conqueror': 'Reached a position beyond 100000 in Array.',
    'Meta-Fighter': 'Owns a Meta Bot with level greater than 5.',
    'Novice Meta-Fighter': 'Owns a Meta Bot with level greater than 10.',
    'Elite Meta-Fighter': 'Owns a Meta Bot with level greater than 20.',
    'Legendary Meta-Fighter': 'Owns a Meta Bot with level greater than 30.', 
    'Wordler Beginner': 'Played 3 or more Wordler games.',
    'Wordler Expert': 'Played 30 or more Wordler games.',
    'Master Wordler': 'Played 100 or more Wordler games.',
    'Wordler Legend': 'Played 1000 or more Wordler games.',
    'Wordler God': 'Played 10000 or more Wordler games.',
    'Bug Hunter': 'Reported and verified a significant bug in the system.',
    'Owner': 'Owner or administrator of the platform.'
  }; 
}
