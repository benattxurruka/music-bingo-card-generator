#!/usr/bin/env python
import random
import xlsxwriter

song_list = []
try:
    with open("./../songs.txt","r", encoding='utf-8') as f:
        song_list = f.readlines()
except:
    print("Could not read songs.txt file.")

# Card style and number of cards to generate
columns = 3
rows   = 2
cards = 100

min_rand_num = 1
max_rand_num = len(song_list)

# Spreadsheed table formats
workbook = xlsxwriter.Workbook('./../bingoCards.xlsx')
worksheet = workbook.add_worksheet()
cell_format = workbook.add_format()
cell_format.set_align('center')
cell_format.set_border(1)
cell_format.set_border_color('black')
merge_format = workbook.add_format({
    'align':  'center',
    'bold':   True,
    'border': 1,
})

def add_card_to_spreadsheet(bingo_card, row):
    worksheet.merge_range(row, 0, row, 2, "Music Bingo", merge_format)
    row += 1
    for col, data in enumerate(bingo_card):
        worksheet.write_column(row, col, data, cell_format)
    row += 3
    return row

def generate_cards():
    rand_range = range(min_rand_num, max_rand_num)
    row = 0

    try:
        for h in range(cards):
            card_as_numbers = []
            try:
                card_as_numbers = random.sample(rand_range, columns * rows)
            except:
                print("There are not enough songs in the list to generate bingo cards.")
            bingo_card = []
            for i in range(columns):
                bingo_row = []
                for j in range(rows):
                    number = card_as_numbers[i * rows + j]
                    bingo_row.append(song_list[number])
                bingo_card.append(bingo_row)
            row = add_card_to_spreadsheet(bingo_card, row)
    except:
        print("Bingo cards could not been generated.")

    return row > 0 # if greater than 0, cards were generated

def format_and_save_file():
    card_size_with_spaces = 4
    for card_index in range(cards):
        worksheet.set_row(card_size_with_spaces * card_index, 30) # Tite
        worksheet.set_row(card_size_with_spaces * card_index + 1, 50) # First bingo card row
        worksheet.set_row(card_size_with_spaces * card_index + 2, 50) # Second bingo card row
    worksheet.autofit() # Autofit width
    worksheet.set_column('D:XFD', None, None, {'hidden': True}) # Hide columns after bingo card
    workbook.close()
    print("Music bingo cards generated succesfully.")

def main():
    if (generate_cards()):
        format_and_save_file()
    
main()